'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { computeStreak } from '@/lib/streak/compute-streak';
import { generateCoachComment } from '@/lib/llm/llm-service';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import type { Session, SessionInput } from '@/lib/schemas/session';

const KEY = ['sessions'] as const;

async function recomputeStreakSideEffect() {
  const [current, sessions] = await Promise.all([
    streakRepo.get(),
    sessionRepo.getAll(),
  ]);
  const next = computeStreak({
    sessions,
    previousStreak: current,
    now: new Date(),
  });
  await streakRepo.save(next);
  return next;
}

async function generateCoachCommentSideEffect(session: Session): Promise<void> {
  try {
    const [llmSettings, appSettings, recent] = await Promise.all([
      llmSettingsRepo.get(),
      settingsRepo.get(),
      sessionRepo.getAll(),
    ]);

    if (Object.keys(llmSettings.providers).length === 0) {
      // No provider configured — leave coachComment null silently.
      return;
    }

    const result = await generateCoachComment({
      currentSession: session,
      recentSessions: recent.filter((s) => s.id !== session.id).slice(0, 5),
      personality: appSettings.selectedCoachPersonality,
      displayName: appSettings.displayName,
      llmSettings,
    });

    await sessionRepo.update(session.id, {
      coachComment: result.comment,
      coachPersonalityAtGeneration: result.personalityUsed,
      failedLLM: false,
    });
    await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
  } catch (e) {
    const failedLLM = true;
    let errorMessage: string | undefined;
    if (e instanceof LLMException) {
      errorMessage = e.message;
      // Don't log offline as a hard failure — it's expected.
      if (e.kind === LLMExceptionKind.Offline) return;
    } else {
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    console.warn('Coach comment generation failed:', errorMessage);
    await sessionRepo.update(session.id, { failedLLM, coachComment: null });
  }
}

export function useSessions() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => sessionRepo.getAll(),
  });

  const invalidateBoth = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['streak'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: SessionInput) => sessionRepo.save(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const optimistic: Session = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        coachComment: null,
        calendarEventId: null,
        failedLLM: false,
      };
      const previous = qc.getQueryData<Session[]>(KEY);
      qc.setQueryData<Session[]>(KEY, (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: async (saved) => {
      await recomputeStreakSideEffect();
      invalidateBoth();
      // Fire-and-forget coach comment (don't await; UI updates via liveQuery)
      void generateCoachCommentSideEffect(saved);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Session> }) =>
      sessionRepo.update(id, patch),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionRepo.delete(id),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    createSession: createMutation.mutateAsync,
    updateSession: updateMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
    retryCoachComment: generateCoachCommentSideEffect,
  };
}
