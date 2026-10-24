import { DayPlanSchema, type DayPlan } from '@/lib/schemas/day-plan';
import type { Task, TaskStatus } from '@/lib/schemas/task';
import { normaliseJournalText, SHUTDOWN_NOTE_MAX, FIRST_ACTION_MAX, JOURNAL_TEXT_MAX } from './template';

/**
 * The evening shutdown (roadmap Wave 12), as pure logic.
 *
 * "Mark today's picks done or rolled back, write the shutdown note and
 * tomorrow's first action, tick off domains."
 *
 * Vocabulary: a pick that does not get done goes **back on the list**. Nothing
 * is "overdue", "late" or "rolled over", nothing is deleted, and nothing is
 * duplicated — the task keeps its id and becomes `next` again.
 *
 * The stored decisions MERGE: the shutdown is edited more than once in an
 * evening (the note first, the picks later, or a single pick changed), and a
 * later, smaller call must not erase what was recorded earlier. Arrays are kept
 * sorted, so a re-run with the same decisions in any order produces the same
 * row and `changed` is false, which lets the caller skip the write.
 */

export type ShutdownOutcome = 'done' | 'back';

export interface ShutdownDecision {
  taskId: string;
  outcome: ShutdownOutcome;
}

export interface PlanShutdownInput {
  /** The day's plan, or null when the day has none yet. */
  plan: DayPlan | null;
  date: string;
  tasks: readonly Task[];
  decisions: readonly ShutdownDecision[];
  /** Edits applied in the same write; omitted fields keep their value. */
  journal?: string | null;
  shutdownNote?: string | null;
  firstActionTomorrow?: string | null;
  domainChecks?: Record<string, boolean>;
  now: Date;
}

export interface TaskStatusPatch {
  id: string;
  status: Extract<TaskStatus, 'done' | 'next'>;
  /**
   * A pick that goes back on the list loses any stale defer day, exactly like
   * the inbox's "next action" outcome: it is a next task now, not a scheduled
   * one.
   */
  clearDeferUntil?: boolean;
}

export interface ShutdownPlan {
  /** The day plan as it should be stored. */
  plan: DayPlan;
  /** Status changes the caller applies in the same transaction. */
  taskPatches: TaskStatusPatch[];
  /** False when a second identical shutdown would write exactly the same row. */
  changed: boolean;
}

export type ShutdownResult = { ok: true; value: ShutdownPlan } | { ok: false; error: string };

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  return left.every((id, index) => id === b[index]);
}

function sameChecks(
  a: Record<string, boolean> | undefined,
  b: Record<string, boolean> | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  const left = a ?? {};
  const right = b ?? {};
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => left[key] === right[key]);
}

/** Last decision per task wins; the order of the input does not matter. */
function resolveDecisions(decisions: readonly ShutdownDecision[]): Map<string, ShutdownOutcome> {
  const byTask = new Map<string, ShutdownOutcome>();
  for (const decision of decisions) byTask.set(decision.taskId, decision.outcome);
  return byTask;
}

/**
 * Build the shutdown: the day plan row, the task status changes, and whether
 * anything actually changed.
 */
export function planShutdown(input: PlanShutdownInput): ShutdownResult {
  const journal = input.journal === undefined ? undefined : normaliseJournalText(input.journal ?? '', JOURNAL_TEXT_MAX);
  if (journal && !journal.ok) return { ok: false, error: journal.error };
  const note =
    input.shutdownNote === undefined
      ? undefined
      : normaliseJournalText(input.shutdownNote ?? '', SHUTDOWN_NOTE_MAX);
  if (note && !note.ok) return { ok: false, error: note.error };
  const firstAction =
    input.firstActionTomorrow === undefined
      ? undefined
      : normaliseJournalText(input.firstActionTomorrow ?? '', FIRST_ACTION_MAX);
  if (firstAction && !firstAction.ok) return { ok: false, error: firstAction.error };

  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const resolved = resolveDecisions(input.decisions);

  // Only decisions that name a task that still exists are recorded, so a task
  // deleted between the plan and the shutdown cannot leave a dangling id.
  const existing = [...resolved.entries()].filter(([taskId]) => taskById.has(taskId));

  // The stored lists are a RECORD the person can edit more than once in an
  // evening: a later call that names fewer tasks (or only the note) must merge,
  // never rebuild. Start from what is already recorded, apply this call's
  // decisions (a task moves between the lists, never sits in both), and drop
  // only ids whose task no longer exists.
  const previousDone = (input.plan?.picksDone ?? []).filter((id) => taskById.has(id));
  const previousBack = (input.plan?.picksBack ?? []).filter((id) => taskById.has(id));
  const doneSet = new Set(previousDone);
  const backSet = new Set(previousBack);
  for (const [taskId, outcome] of existing) {
    if (outcome === 'done') {
      doneSet.add(taskId);
      backSet.delete(taskId);
    } else {
      backSet.add(taskId);
      doneSet.delete(taskId);
    }
  }
  const picksDone = [...doneSet].sort();
  const picksBack = [...backSet].sort();

  const taskPatches: TaskStatusPatch[] = [];
  for (const [taskId, outcome] of existing) {
    const task = taskById.get(taskId)!;
    const status: TaskStatusPatch['status'] = outcome === 'done' ? 'done' : 'next';
    const clearDeferUntil = outcome === 'back' && task.deferUntil != null;
    if (task.status !== status || clearDeferUntil) {
      taskPatches.push({ id: taskId, status, ...(clearDeferUntil ? { clearDeferUntil } : {}) });
    }
  }

  const previous = input.plan;
  const journalText = journal ? journal.value : (previous?.journal ?? null);
  const noteText = note ? note.value : (previous?.shutdownNote ?? null);
  const actionText = firstAction ? firstAction.value : (previous?.firstActionTomorrow ?? null);
  const checks = input.domainChecks ?? previous?.domainChecks;

  const changed =
    !previous ||
    (input.decisions.length > 0 &&
      (!sameIds(previous.picksDone, picksDone) || !sameIds(previous.picksBack, picksBack))) ||
    taskPatches.length > 0 ||
    (journal !== undefined && journalText !== (previous.journal ?? null)) ||
    (note !== undefined && noteText !== (previous.shutdownNote ?? null)) ||
    (firstAction !== undefined && actionText !== (previous.firstActionTomorrow ?? null)) ||
    (input.domainChecks !== undefined && !sameChecks(previous.domainChecks, checks));

  const plan: DayPlan = DayPlanSchema.parse({
    ...(previous ?? { date: input.date, picks: [], capacityMin: 0 }),
    date: input.date,
    journal: journalText,
    shutdownNote: noteText,
    firstActionTomorrow: actionText,
    domainChecks: checks,
    picksDone,
    picksBack,
    shutdownAt: previous?.shutdownAt ?? (input.decisions.length > 0 ? input.now : null),
    createdAt: previous?.createdAt ?? input.now,
    updatedAt: changed ? input.now : (previous?.updatedAt ?? input.now),
  });

  return { ok: true, value: { plan, taskPatches, changed } };
}
