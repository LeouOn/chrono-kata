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

  /** The tasks as the first shutdown left them (statuses + cleared defer days). */
  function afterFirst(first: ReturnType<typeof run>): Task[] {
    return TASKS.map((row) => {
      const patch = first.taskPatches.find((entry) => entry.id === row.id);
      if (!patch) return row;
      return {
        ...row,
        status: patch.status,
        ...(patch.clearDeferUntil ? { deferUntil: null } : {}),
      };
    });
  }

  it('a later call that only edits the note keeps the recorded decisions', () => {
    const first = run(DECISIONS);
    const tasks = afterFirst(first);

    const noteOnly = planShutdown({
      plan: first.plan,
      date: PLAN.date,
      tasks,
      decisions: [],
      shutdownNote: 'Quiet evening after all.',
      now: new Date('2026-06-15T22:10:00'),
    });
    if (!noteOnly.ok) throw new Error(noteOnly.error);

    expect(noteOnly.value.plan.picksDone).toEqual(first.plan.picksDone);
    expect(noteOnly.value.plan.picksBack).toEqual(first.plan.picksBack);
    expect(noteOnly.value.plan.shutdownNote).toBe('Quiet evening after all.');
    expect(noteOnly.value.taskPatches).toEqual([]);
  });

  it('a later call naming one task moves it and keeps the rest of the record', () => {
    const first = run(DECISIONS);
    const tasks = afterFirst(first);

    const second = planShutdown({
      plan: first.plan,
      date: PLAN.date,
      tasks,
      decisions: [{ taskId: BACK_TASK, outcome: 'done' }],
      now: new Date('2026-06-15T22:20:00'),
    });
    if (!second.ok) throw new Error(second.error);

    // BACK_TASK moved from the back list to the done list; nothing else was lost.
    expect(second.value.plan.picksBack).not.toContain(BACK_TASK);
    expect(second.value.plan.picksDone).toEqual(
      [DONE_TASK, BACK_TASK, ...(first.plan.picksDone ?? [])].filter((id, index, all) => all.indexOf(id) === index).sort(),
    );
    expect(second.value.plan.picksBack).toEqual(
      (first.plan.picksBack ?? []).filter((id) => id !== BACK_TASK),
    );
  });

  it('never lets a task be in both lists, whatever order the calls come in', () => {
    const first = run([
      { taskId: BACK_TASK, outcome: 'back' },
      { taskId: BACK_TASK, outcome: 'done' },
    ]);
    expect(first.plan.picksBack ?? []).not.toContain(BACK_TASK);
    expect(first.plan.picksDone).toContain(BACK_TASK);
  });

  it('keeps the record consistent across random sequences of calls (oracle)', () => {
    // Seeded PRNG, so a failure is reproducible.
    let state = 987654321;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };

    let plan = PLAN;
    let tasks = [...TASKS];
    let now = NOW.getTime();
    const recorded = new Set<string>();
    const deleted = new Set<string>();

    for (let call = 0; call < 12; call += 1) {
      now += 60_000;
      const live = tasks.filter((row) => !deleted.has(row.id));
      const decisions: ShutdownDecision[] = live
        .filter(() => random() < 0.5)
        .map((row) => ({ taskId: row.id, outcome: random() < 0.5 ? 'done' : 'back' }));
      const result = planShutdown({
        plan,
        date: PLAN.date,
        tasks: live,
        decisions,
        shutdownNote: random() < 0.3 ? `note ${call}` : undefined,
        now: new Date(now),
      });
      if (!result.ok) throw new Error(result.error);
      plan = result.value.plan;
      for (const id of [...(plan.picksDone ?? []), ...(plan.picksBack ?? [])]) recorded.add(id);
      for (const decision of decisions) recorded.add(decision.taskId);

      // Apply the status patches the way the repository would.
      tasks = tasks.map((row) => {
        const patch = result.value.taskPatches.find((entry) => entry.id === row.id);
        if (!patch) return row;
        return {
          ...row,
          status: patch.status,
          ...(patch.clearDeferUntil ? { deferUntil: null } : {}),
        };
      });

      const done = plan.picksDone ?? [];
      const back = plan.picksBack ?? [];
      // Invariants after every call.
      expect(done.filter((id) => back.includes(id))).toEqual([]);
      expect([...done].sort()).toEqual(done);
      expect([...back].sort()).toEqual(back);
      for (const id of done) {
        const row = tasks.find((entry) => entry.id === id);
        expect(row, `done id ${id} has no task`).toBeDefined();
        expect(row?.status).toBe('done');
      }
      for (const id of back) {
        const row = tasks.find((entry) => entry.id === id);
        expect(row, `back id ${id} has no task`).toBeDefined();
        expect(row?.status).toBe('next');
        expect(row?.deferUntil ?? null).toBeNull();
      }
      // Repeating the same call changes nothing, and never moves the timestamp.
      const repeat = planShutdown({
        plan,
        date: PLAN.date,
        tasks,
        decisions,
        now: new Date(now + 30_000),
      });
      if (!repeat.ok) throw new Error(repeat.error);
      expect(repeat.value.changed).toBe(false);
      expect(repeat.value.plan.updatedAt.getTime()).toBe(plan.updatedAt.getTime());
    }

    // A deleted task disappears from the record; nothing else can vanish.
    const withoutBack = tasks.filter((row) => row.id !== BACK_TASK);
    deleted.add(BACK_TASK);
    const afterDelete = planShutdown({
      plan,
      date: PLAN.date,
      tasks: withoutBack,
      decisions: [],
      now: new Date(now + 60_000),
    });
    if (!afterDelete.ok) throw new Error(afterDelete.error);
    expect(afterDelete.value.plan.picksDone ?? []).not.toContain(BACK_TASK);
    expect(afterDelete.value.plan.picksBack ?? []).not.toContain(BACK_TASK);
    for (const id of recorded) {
      if (id === BACK_TASK) continue;
      const stillThere =
        (afterDelete.value.plan.picksDone ?? []).includes(id) ||
        (afterDelete.value.plan.picksBack ?? []).includes(id);
      expect(stillThere || tasks.find((row) => row.id === id) === undefined).toBe(true);
    }
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
