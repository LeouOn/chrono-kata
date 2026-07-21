'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { streakRepo } from '@/lib/db/streak.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { computeStreak } from '@/lib/streak/compute-streak';

const KEY = ['streak'] as const;

export function useStreak() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => streakRepo.get(),
  });

  const recompute = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    streak: query.data,
    recompute: recompute.mutateAsync,
  };
}
