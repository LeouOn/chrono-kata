'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { streakRepo } from '@/lib/db/streak.repo';
import { recomputeStreakSideEffect } from '@/hooks/useSessions';

const KEY = ['streak'] as const;

export function useStreak() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => streakRepo.get(),
  });

  const recompute = useMutation({
    mutationFn: () => recomputeStreakSideEffect(),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    streak: query.data,
    recompute: recompute.mutateAsync,
  };
}
