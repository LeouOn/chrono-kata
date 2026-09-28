'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { habitRepo } from '@/lib/db/habit.repo';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { backfillHabitLogsForHabit } from '@/lib/habits/session-sync';
import type { Habit, HabitInput, HabitLog } from '@/lib/schemas/habit';

const HABITS_KEY = ['habits'] as const;
const LOGS_KEY = ['habit-logs'] as const;

export function useHabits() {
  const qc = useQueryClient();

  const { data: habits = [], isLoading } = useQuery<Habit[]>({
    queryKey: HABITS_KEY,
    queryFn: () => habitRepo.getAll(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: HABITS_KEY });
    void qc.invalidateQueries({ queryKey: LOGS_KEY });
  };

  const createMutation = useMutation({
    mutationFn: async (input: HabitInput) => {
      const habit = await habitRepo.create(input);
      await backfillHabitLogsForHabit(habit);
      return habit;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<HabitInput> }) => {
      const habit = await habitRepo.update(id, patch);
      if ('linkedActivityLabel' in patch || 'linkedKataTemplateId' in patch || 'kind' in patch) {
        await backfillHabitLogsForHabit(habit);
      }
      return habit;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await habitLogRepo.deleteByHabitId(id);
      return habitRepo.delete(id);
    },
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => habitRepo.reorder(orderedIds),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      habitRepo.update(id, { archivedAt: archived ? new Date() : null }),
    onSuccess: invalidate,
  });

  return {
    habits,
    isLoading,
    createHabit: createMutation.mutateAsync,
    updateHabit: updateMutation.mutateAsync,
    deleteHabit: deleteMutation.mutateAsync,
    reorderHabits: reorderMutation.mutateAsync,
    setHabitArchived: archiveMutation.mutateAsync,
  };
}

export function useHabitLogsForDate(date: string) {
  const { data: logs = [] } = useQuery<HabitLog[]>({
    queryKey: [...LOGS_KEY, date],
    queryFn: () => habitLogRepo.getForDate(date),
  });
  return logs;
}
