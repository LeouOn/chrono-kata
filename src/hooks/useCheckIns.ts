'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkInRepo } from '@/lib/db/check-in.repo';
import type { CheckIn, CheckInInput } from '@/lib/schemas/check-in';

const CHECK_INS_KEY = ['check-ins'] as const;

export function useCheckIn(date: string) {
  return useQuery<CheckIn | null>({
    queryKey: [...CHECK_INS_KEY, date],
    queryFn: async () => (await checkInRepo.getByDate(date)) ?? null,
  });
}

export function useCheckInRange(from: string, to: string) {
  return useQuery<CheckIn[]>({
    queryKey: [...CHECK_INS_KEY, 'range', from, to],
    queryFn: () => checkInRepo.range(from, to),
  });
}

export function useUpsertCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckInInput) => checkInRepo.upsert(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHECK_INS_KEY });
    },
  });
}
