'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { journalRepo } from '@/lib/db/journal.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { domainRepo } from '@/lib/db/domain.repo';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { ShutdownDecision } from '@/lib/journal/shutdown';

/**
 * One day's journal row, or null. The key is the local day.
 *
 * `enabled` exists so a flagged surface can mount without reading anything: with
 * the flag off, no query is created at all.
 */
export function useJournalDay(dayKey: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['journal', dayKey],
    queryFn: () => journalRepo.findByDate(dayKey),
    enabled: options.enabled ?? true,
  });
}

/** Every day plan, newest first: what the search and the range export read. */
export function useJournalList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['journal', 'all'],
    queryFn: () => journalRepo.listAll(),
    enabled: options.enabled ?? true,
  });
}

/**
 * Everything a markdown export needs, read from the repositories at CALL time.
 *
 * The export must not be built from react-query caches: a journal saved a moment
 * ago (here or in another tab) may not have refetched yet, and the file would
 * miss it. The button's loading guard still covers the first paint.
 */
export async function readJournalExportSource() {
  const [plans, tasks, domains] = await Promise.all([
    journalRepo.listAll(),
    taskRepo.getAll(),
    domainRepo.getAll(),
  ]);
  return { plans, tasks, domains };
}

export interface ShutdownInput {
  date: string;
  decisions: ShutdownDecision[];
  shutdownNote?: string | null;
  firstActionTomorrow?: string | null;
  domainChecks?: Record<string, boolean>;
}

/**
 * Writes for the journal screen.
 *
 * Both seed the day's cache on success (so a refetch never flashes empty) and
 * invalidate everything that shows what changed: the day plan the Today card and
 * the plan screen read, and the tasks a shutdown moved.
 */
export function useJournalWrites() {
  const qc = useQueryClient();

  const settle = (plan: DayPlan) => {
    qc.setQueryData(['journal', plan.date], plan);
    qc.setQueryData(['dayPlan', plan.date], plan);
    void qc.invalidateQueries({ queryKey: ['journal'] });
    void qc.invalidateQueries({ queryKey: ['dayPlan'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['plan'] });
  };

  const saveFields = useMutation({
    mutationFn: (input: {
      date: string;
      journal?: string | null;
      shutdownNote?: string | null;
      firstActionTomorrow?: string | null;
      domainChecks?: Record<string, boolean>;
    }) => {
      const { date, ...fields } = input;
      return journalRepo.saveDayFields(date, fields);
    },
    onSuccess: settle,
  });

  const applyShutdown = useMutation({
    mutationFn: (input: ShutdownInput) => journalRepo.applyShutdown(input),
    onSuccess: settle,
  });

  return { saveFields, applyShutdown };
}

/**
 * The outcome a pick currently has, so the shutdown screen opens on what was
 * already decided instead of a blank slate.
 */
export function outcomeOf(plan: DayPlan | null | undefined, taskId: string): ShutdownDecision['outcome'] | null {
  if (!plan) return null;
  if ((plan.picksDone ?? []).includes(taskId)) return 'done';
  if ((plan.picksBack ?? []).includes(taskId)) return 'back';
  return null;
}

/**
 * The decisions implied by the current choices, in pick order. A task with no
 * choice is not decided, so an untouched pick keeps its status.
 */
export function decisionsFor(
  picks: readonly string[],
  choices: Readonly<Record<string, ShutdownDecision['outcome'] | undefined>>,
): ShutdownDecision[] {
  return picks.flatMap((taskId) => {
    const outcome = choices[taskId];
    return outcome ? [{ taskId, outcome }] : [];
  });
}

/** A short, calm summary of what a shutdown did. */
export function shutdownSummary(plan: DayPlan): string {
  const done = (plan.picksDone ?? []).length;
  const back = (plan.picksBack ?? []).length;
  if (done === 0 && back === 0) return 'The day is closed.';
  const parts: string[] = [];
  if (done > 0) parts.push(`${done} moved`);
  if (back > 0) parts.push(`${back} back on the list`);
  return `The day is closed: ${parts.join(', ')}.`;
}
