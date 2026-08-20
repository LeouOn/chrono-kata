'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionRepo } from '@/lib/db/session.repo';
import { conversationRepo } from '@/lib/db/conversation.repo';
import { messageRepo } from '@/lib/db/message.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { computeStreak } from '@/lib/streak/compute-streak';
import { generateCoachCommentStream } from '@/lib/llm/llm-service';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import { dispatchToast } from '@/components/ui/Toast';
import {
  syncSessionCreateOrUpdate,
  syncSessionDelete,
  flushPendingOps,
} from '@/lib/calendar/sync';
import type { Session, SessionInput } from '@/lib/schemas/session';

const KEY = ['sessions'] as const;

async function recomputeStreakSideEffect() {
  const [current, sessions, settings] = await Promise.all([
    streakRepo.get(),
    sessionRepo.getAll(),
    settingsRepo.get(),
  ]);
  const next = computeStreak({
    sessions,
    previousStreak: current,
    now: new Date(),
    restDays: settings?.restDays ?? [],
    streakFreezeTokens: settings?.streakFreezeTokens ?? 0,
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
      return;
    }

    const existingConv = session.conversationId
      ? await conversationRepo.getById(session.conversationId)
      : null;
    const conversation = existingConv ?? (await conversationRepo.save({ sessionId: session.id }));

    const rootUserMessage = await messageRepo.save({
      conversationId: conversation.id,
      parentId: null,
      role: 'user',
      content: buildCoachUserTextForConversation(session, recent),
    });
    await conversationRepo.update(conversation.id, { rootMessageId: rootUserMessage.id });

    const placeholder = await messageRepo.save({
      conversationId: conversation.id,
      parentId: rootUserMessage.id,
      role: 'assistant',
      content: '',
    });
    await conversationRepo.update(conversation.id, { activeLeafId: placeholder.id });

    const result = await generateCoachCommentStream({
      currentSession: session,
      recentSessions: recent.filter((s) => s.id !== session.id).slice(0, 5),
      personality: appSettings.selectedCoachPersonality,
      displayName: appSettings.displayName,
      llmSettings,
      onToken: (visibleText) => {
        void messageRepo.update(placeholder.id, { content: visibleText });
        void sessionRepo.update(session.id, { coachComment: visibleText });
      },
    });

    await messageRepo.update(placeholder.id, {
      content: result.comment,
      provider: result.providerName,
      model: result.model,
      personality: result.personalityUsed,
      tokensUsed: { prompt: result.promptTokens, completion: result.completionTokens },
      latencyMs: result.latencyMs,
      systemPrompt: result.systemPrompt,
      rawPrompt: result.userText,
    });
    await conversationRepo.update(conversation.id, { activeLeafId: placeholder.id });

    await sessionRepo.update(session.id, {
      conversationId: conversation.id,
      coachComment: result.comment,
      coachPersonalityAtGeneration: result.personalityUsed,
      failedLLM: false,
    });
    await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
  } catch (e) {
    const failedLLM = true;
    let errorMessage: string | undefined;
    let isOffline = false;
    if (e instanceof LLMException) {
      errorMessage = e.message;
      if (e.kind === LLMExceptionKind.Offline) {
        isOffline = true;
      }
    } else {
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    console.warn('Coach comment generation failed:', errorMessage);
    await sessionRepo.update(session.id, { failedLLM, coachComment: null });
    if (!isOffline && errorMessage) {
      dispatchToast(errorMessage, 'error');
    }
  }
}

function buildCoachUserTextForConversation(session: Session, recent: Session[]): string {
  const recentLines = recent
    .filter((s) => s.id !== session.id)
    .slice(0, 5)
    .map((s) => {
      const date = s.startedAt.toISOString().slice(0, 10);
      const dur = s.durationMinutes != null ? `${s.durationMinutes}m` : `${s.reps ?? 0} reps`;
      return `${date} | ${s.activityLabel ?? ''} | ${dur} | ${s.rating}/5`;
    })
    .join('\n');
  const date = session.startedAt.toISOString().slice(0, 10);
  const dur = session.durationMinutes != null ? `${session.durationMinutes}m` : `${session.reps ?? 0} reps`;
  return `Session on ${date}: ${session.activityLabel ?? 'practice'} for ${dur}, rated ${session.rating}/5${session.note ? ` — note: ${session.note}` : ''}.\n\nRecent sessions:\n${recentLines}\n\nRespond with a 3-6 sentence reflection.`;
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
      // Fire-and-forget calendar sync (enqueues on failure)
      void syncSessionCreateOrUpdate(saved);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Session> }) =>
      sessionRepo.update(id, patch),
    onSettled: async (_data, _error, variables) => {
      await recomputeStreakSideEffect();
      invalidateBoth();
      // Fire-and-forget: re-fetch the updated session and push to calendar
      void (async () => {
        const updated = await sessionRepo.getById(variables.id);
        if (updated) void syncSessionCreateOrUpdate(updated);
      })();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const session = await sessionRepo.getById(id);
      if (session) void syncSessionDelete(session);
      return sessionRepo.delete(id);
    },
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
