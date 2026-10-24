import { describe, expect, it } from 'vitest';
import { planShutdown, type ShutdownDecision } from '@/lib/journal/shutdown';
import { DayPlanSchema, type DayPlan } from '@/lib/schemas/day-plan';
import type { Task } from '@/lib/schemas/task';

const NOW = new Date('2026-06-15T21:30:00');
const DONE_TASK = 'aaaaaaaa-1111-4111-8111-111111111111';
const BACK_TASK = 'bbbbbbbb-2222-4222-8222-222222222222';
const WAITING_TASK = 'cccccccc-3333-4333-8333-333333333333';
const SCHEDULED_TASK = 'dddddddd-4444-4444-8444-444444444444';
const TRADING = 'eeeeeeee-5555-4555-8555-555555555555';

function task(patch: Partial<Task> & { id: string }): Task {
  const t = new Date('2026-06-01T00:00:00Z');
  return { title: patch.id, status: 'next', source: 'manual', createdAt: t, touchedAt: t, ...patch } as Task;
}

const TASKS = [
  task({ id: DONE_TASK }),
  task({ id: BACK_TASK }),
  task({ id: WAITING_TASK, status: 'waiting' }),
  task({ id: SCHEDULED_TASK, status: 'scheduled', deferUntil: new Date('2026-06-15T12:00:00') }),
];

const PLAN: DayPlan = {
  date: '2026-06-15',
  picks: [DONE_TASK, BACK_TASK, WAITING_TASK, SCHEDULED_TASK],
  capacityMin: 180,
  journal: 'A calm day.',
  createdAt: new Date('2026-06-15T07:00:00'),
  updatedAt: new Date('2026-06-15T07:00:00'),
} as DayPlan;

const DECISIONS: ShutdownDecision[] = [
  { taskId: DONE_TASK, outcome: 'done' },
  { taskId: BACK_TASK, outcome: 'back' },
  { taskId: WAITING_TASK, outcome: 'back' },
  { taskId: SCHEDULED_TASK, outcome: 'back' },
];

function run(decisions: ShutdownDecision[] = DECISIONS, extra: Partial<Parameters<typeof planShutdown>[0]> = {}) {
  const result = planShutdown({ plan: PLAN, date: PLAN.date, tasks: TASKS, decisions, now: NOW, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('planShutdown', () => {
  it('records what moved and what goes back, and changes the tasks', () => {
    const { plan, taskPatches } = run();

    expect(plan.picksDone).toEqual([DONE_TASK]);
    expect([...(plan.picksBack ?? [])].sort()).toEqual([BACK_TASK, WAITING_TASK, SCHEDULED_TASK].sort());
    // The day's picks stay a record of what was planned.
    expect(plan.picks).toEqual(PLAN.picks);
    expect(plan.shutdownAt?.getTime()).toBe(NOW.getTime());

    const byId = new Map(taskPatches.map((patch) => [patch.id, patch]));
    expect(byId.get(DONE_TASK)).toEqual({ id: DONE_TASK, status: 'done' });
    expect(byId.get(WAITING_TASK)).toEqual({ id: WAITING_TASK, status: 'next' });
    // A pick going back to the list loses a stale defer day.
    expect(byId.get(SCHEDULED_TASK)).toEqual({
      id: SCHEDULED_TASK,
      status: 'next',
      clearDeferUntil: true,
    });
    // A task that is already `next` needs no write at all.
    expect(byId.has(BACK_TASK)).toBe(false);
  });

  it('is idempotent: the same shutdown twice writes the same row and changes nothing', () => {
    const first = run();
    const stored = { ...PLAN, ...first.plan };

    const second = planShutdown({
      plan: stored,
      date: stored.date,
      // The stored tasks are what the first shutdown left behind: the new
      // statuses, and no stale defer day on the pick that went back.
      tasks: TASKS.map((row) => {
        const patch = first.taskPatches.find((entry) => entry.id === row.id);
        if (!patch) return row;
        return {
          ...row,
          status: patch.status,
          ...(patch.clearDeferUntil ? { deferUntil: null } : {}),
        };
      }),
      decisions: [...DECISIONS].reverse(),
      now: new Date('2026-06-15T22:45:00'),
    });
    if (!second.ok) throw new Error(second.error);

    expect(second.value.changed).toBe(false);
    expect(second.value.taskPatches).toEqual([]);
    expect(second.value.plan).toEqual(first.plan);
    expect(second.value.plan.updatedAt.getTime()).toBe(first.plan.updatedAt.getTime());
  });

  it('does not depend on the order of the decisions', () => {
    const forward = run(DECISIONS);
    const reversed = run([...DECISIONS].reverse());
    expect(reversed.plan.picksDone).toEqual(forward.plan.picksDone);
    expect(reversed.plan.picksBack).toEqual(forward.plan.picksBack);
  });

  it('takes the last decision for a task that appears twice', () => {
    const { plan } = run([
      { taskId: BACK_TASK, outcome: 'done' },
      { taskId: BACK_TASK, outcome: 'back' },
    ]);
    expect(plan.picksDone ?? []).not.toContain(BACK_TASK);
    expect(plan.picksBack).toEqual([BACK_TASK]);
  });

  it('ignores a decision for a task that no longer exists', () => {
    const { plan, taskPatches } = run([
      { taskId: 'ffffffff-6666-4666-8666-666666666666', outcome: 'done' },
    ]);
    expect(plan.picksDone).toEqual([]);
    expect(taskPatches).toEqual([]);
  });

  it('saves the note, tomorrow’s first move, the journal and the domain ticks with it', () => {
    const { plan, changed } = run(DECISIONS, {
      shutdownNote: 'Left the review for tomorrow.',
      firstActionTomorrow: 'Start with trading prep.',
      journal: 'A calm day.\n\nPractice was short.',
      domainChecks: { [TRADING]: true },
    });
    expect(changed).toBe(true);
    expect(plan.shutdownNote).toBe('Left the review for tomorrow.');
    expect(plan.firstActionTomorrow).toBe('Start with trading prep.');
    expect(plan.journal).toBe('A calm day.\n\nPractice was short.');
    expect(plan.domainChecks).toEqual({ [TRADING]: true });
    expect(DayPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('refuses a note that is too long, on the normalised value', () => {
    const result = planShutdown({
      plan: PLAN,
      date: PLAN.date,
      tasks: TASKS,
      decisions: [],
      // 2001 characters after normalisation.
      shutdownNote: 'x'.repeat(2001),
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2,000/);
  });

  it('creates a bare day when the day has no plan yet', () => {
    const result = planShutdown({
      plan: null,
      date: '2026-06-16',
      tasks: TASKS,
      decisions: [{ taskId: DONE_TASK, outcome: 'done' }],
      now: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.plan).toMatchObject({ date: '2026-06-16', picks: [], capacityMin: 0 });
    expect(DayPlanSchema.safeParse(result.value.plan).success).toBe(true);
  });

  it('leaves a field it was not given exactly as it was', () => {
    const withNote = { ...PLAN, shutdownNote: 'from yesterday' } as DayPlan;
    const result = planShutdown({
      plan: withNote,
      date: withNote.date,
      tasks: TASKS,
      decisions: [{ taskId: DONE_TASK, outcome: 'done' }],
      now: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.plan.shutdownNote).toBe('from yesterday');
  });
});
