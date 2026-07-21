'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { computeStreak } from '@/lib/streak/compute-streak';
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
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
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
  };
}
