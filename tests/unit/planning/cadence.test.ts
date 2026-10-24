import { describe, expect, it } from 'vitest';
import {
  CADENCE_WINDOW_DAYS,
  cadenceDebt,
  cadenceProgress,
  cadenceWindowKeys,
  projectOfTaskIndex,
  sessionProjectId,
} from '@/lib/planning/cadence';
import { cadenceDebt as cadenceDebtFromRankPicks } from '@/lib/planning/rank-picks';
import { ProjectSchema } from '@/lib/schemas/project';
import {
  DST_WEEK_MONDAYS,
  ZONES,
  inZone,
  intlDayKey,
  keyDiff,
  local,
  makeProject,
  makeSession,
  makeTask,
  seeded,
} from './w10-helpers';
import { addDays } from '@/lib/pacing/days';

const NOW_KEY = '2026-06-17';
const now = () => local(NOW_KEY, 9, 0);
const daysAgo = (n: number, hour = 9, minute = 0) => local(addDays(NOW_KEY, -n), hour, minute);

describe('the schema fields', () => {
  const base = {
    id: '22222222-0000-4000-8000-000000000999',
    title: 'p',
    status: 'active',
    lastTouchedAt: new Date(2026, 0, 1),
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  };

  it('are optional: a row from before Wave 10 parses unchanged', () => {
    const parsed = ProjectSchema.parse({ ...base, cadencePerWeek: 2 });
    expect(parsed.cadenceBlockMin).toBeUndefined();
    expect(parsed.stallAfterDays).toBeUndefined();
  });

  it('accept null (cleared) and in-range numbers', () => {
    const parsed = ProjectSchema.parse({ ...base, cadenceBlockMin: null, stallAfterDays: null });
    expect(parsed.cadenceBlockMin).toBeNull();
    const ok = ProjectSchema.parse({ ...base, cadencePerWeek: 2, cadenceBlockMin: 45, stallAfterDays: 10 });
    expect([ok.cadenceBlockMin, ok.stallAfterDays]).toEqual([45, 10]);
  });

  it('reject values that would break the arithmetic', () => {
    for (const bad of [0, 4, 241, 12.5, -45, Number.NaN, Infinity]) {
      expect(ProjectSchema.safeParse({ ...base, cadenceBlockMin: bad }).success, `block ${bad}`).toBe(false);
    }
    for (const bad of [0, 2, 366, 7.5, -1, Number.NaN]) {
      expect(ProjectSchema.safeParse({ ...base, stallAfterDays: bad }).success, `stall ${bad}`).toBe(false);
    }
  });
});

describe('cadenceWindowKeys', () => {
  it('is today and the six days before it, by local calendar', () => {
    inZone('Europe/Helsinki', () => {
      expect([...cadenceWindowKeys(local('2026-03-30', 0, 5))].sort()).toEqual([
        '2026-03-24',
        '2026-03-25',
        '2026-03-26',
        '2026-03-27',
        '2026-03-28',
        '2026-03-29',
        '2026-03-30',
      ]);
      expect(cadenceWindowKeys(now()).size).toBe(CADENCE_WINDOW_DAYS);
    });
  });
});

describe('which project a session belongs to', () => {
  const task = makeTask({ projectId: '22222222-0000-4000-8000-0000000000aa' });
  const index = projectOfTaskIndex([task, makeTask({ projectId: null })]);

  it('is the named project, else the task\'s project, else none', () => {
    const explicit = '22222222-0000-4000-8000-0000000000bb';
    expect(sessionProjectId({ projectId: explicit, taskId: null }, index)).toBe(explicit);
    expect(sessionProjectId({ projectId: null, taskId: task.id }, index)).toBe(task.projectId);
    // An explicit project wins over the task's.
    expect(sessionProjectId({ projectId: explicit, taskId: task.id }, index)).toBe(explicit);
    expect(sessionProjectId({ projectId: null, taskId: 'unknown' }, index)).toBeNull();
    expect(sessionProjectId({ projectId: null, taskId: null }, index)).toBeNull();
    // No index given: a task link cannot be followed.
    expect(sessionProjectId({ projectId: null, taskId: task.id })).toBeNull();
  });

  it('indexes only tasks that have a project', () => {
    expect(index.size).toBe(1);
  });
});

describe('cadence debt by sessions (the original rule)', () => {
  it('is 0 without a target, and the target minus this week\'s sessions with one', () => {
    inZone('UTC', () => {
      const none = makeProject({});
      const three = makeProject({ cadencePerWeek: 3 });
      const sessions = [daysAgo(0), daysAgo(2), daysAgo(9)].map((startedAt) =>
        makeSession({ startedAt, projectId: three.id }),
      );
      expect(cadenceDebt(none, sessions, now())).toBe(0);
      expect(cadenceDebt(three, sessions, now())).toBe(1); // two in the window, one out
      expect(cadenceDebt(three, [], now())).toBe(3);
    });
  });

  it('is re-exported from the ranking module under the same name', () => {
    expect(cadenceDebtFromRankPicks).toBe(cadenceDebt);
  });

  it('never goes below zero', () => {
    inZone('UTC', () => {
      const one = makeProject({ cadencePerWeek: 1 });
      const sessions = [0, 1, 2, 3].map((n) => makeSession({ startedAt: daysAgo(n), projectId: one.id }));
      expect(cadenceDebt(one, sessions, now())).toBe(0);
    });
  });

  it('counts a session spent on one of the project\'s TASKS, when told about the tasks', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 2 });
      const task = makeTask({ projectId: project.id });
      const session = makeSession({ startedAt: daysAgo(1), taskId: task.id, projectId: null });
      expect(cadenceDebt(project, [session], now(), [task])).toBe(1);
      // Without the tasks the link cannot be followed (the old behaviour).
      expect(cadenceDebt(project, [session], now())).toBe(2);
    });
  });

  it('does not count another project\'s sessions or unlinked practice', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 2 });
      const other = makeProject({ cadencePerWeek: 2 });
      const otherTask = makeTask({ projectId: other.id });
      const sessions = [
        makeSession({ startedAt: daysAgo(1), projectId: other.id }),
        makeSession({ startedAt: daysAgo(1), taskId: otherTask.id }),
        makeSession({ startedAt: daysAgo(1) }),
      ];
      expect(cadenceDebt(project, sessions, now(), [otherTask])).toBe(2);
    });
  });
});

describe('cadence debt by minutes ("2 blocks a week, 45 min")', () => {
  const project = () => makeProject({ cadencePerWeek: 2, cadenceBlockMin: 45 });
  const sessionsOf = (p: { id: string }, minutes: (number | null)[]) =>
    minutes.map((m, index) =>
      m === null
        ? makeSession({ startedAt: daysAgo(index), projectId: p.id, durationMinutes: null, reps: 12 })
        : makeSession({ startedAt: daysAgo(index), projectId: p.id, durationMinutes: m }),
    );

  it('gives a short touch a share of a block, not a whole one', () => {
    inZone('UTC', () => {
      const p = project();
      expect(cadenceDebt(p, [], now())).toBe(2);
      expect(cadenceDebt(p, sessionsOf(p, [10]), now())).toBe(2); // 10 of 90 minutes
      expect(cadenceDebt(p, sessionsOf(p, [10, 10]), now())).toBe(2); // 20 of 90
      expect(cadenceDebt(p, sessionsOf(p, [45]), now())).toBe(1);
      expect(cadenceDebt(p, sessionsOf(p, [45, 20]), now())).toBe(1); // 65 of 90: one more block would do
      expect(cadenceDebt(p, sessionsOf(p, [45, 45]), now())).toBe(0);
    });
  });

  it('lets short sessions add up, with no rounding up per session', () => {
    inZone('UTC', () => {
      const p = project();
      expect(cadenceDebt(p, sessionsOf(p, [30, 30, 30]), now())).toBe(0); // 90 of 90
      expect(cadenceDebt(p, sessionsOf(p, [30, 30]), now())).toBe(1); // 60 of 90
      expect(cadenceDebt(p, sessionsOf(p, [22.5, 22.5]), now())).toBe(1); // 30-second precision
    });
  });

  it('is not fooled by float noise in summed minutes', () => {
    inZone('UTC', () => {
      // 10.2 + 10.1 + 24.699999999999996 is 44.99999999999999 in floating point,
      // a hair under one 45-minute block, though the user did exactly 45.
      const noisy = [10.2, 10.1, 24.699999999999996];
      expect(noisy.reduce((a, b) => a + b, 0)).toBeLessThan(45);
      const one = makeProject({ cadencePerWeek: 1, cadenceBlockMin: 45 });
      expect(cadenceDebt(one, sessionsOf(one, noisy), now())).toBe(0);
      const two = project();
      expect(cadenceDebt(two, sessionsOf(two, noisy), now())).toBe(1);
    });
  });

  it('never pays more than one block for one session: no heroic pushes', () => {
    inZone('UTC', () => {
      const p = project();
      expect(cadenceDebt(p, sessionsOf(p, [180]), now())).toBe(1);
      expect(cadenceDebt(p, sessionsOf(p, [480]), now())).toBe(1);
      expect(cadenceDebt(p, sessionsOf(p, [180, 180]), now())).toBe(0);
    });
  });

  it('counts a reps-only session, which has no minutes, as a whole block', () => {
    inZone('UTC', () => {
      const p = project();
      expect(cadenceDebt(p, sessionsOf(p, [null]), now())).toBe(1);
      expect(cadenceDebt(p, sessionsOf(p, [null, null]), now())).toBe(0);
    });
  });

  it('is inert without a weekly target', () => {
    inZone('UTC', () => {
      const p = makeProject({ cadenceBlockMin: 45 });
      expect(cadenceDebt(p, [], now())).toBe(0);
      expect(cadenceProgress(p, [], now()).wanted).toBe(0);
    });
  });

  it('reports what the week has had, for the reason shown to the user', () => {
    inZone('UTC', () => {
      const p = project();
      const progress = cadenceProgress(p, sessionsOf(p, [10, 50]), now());
      expect(progress).toMatchObject({ wanted: 2, blockMin: 45, sessions: 2, minutes: 60, debt: 1 });
    });
  });

  it('follows task links here too', () => {
    inZone('UTC', () => {
      const p = project();
      const task = makeTask({ projectId: p.id });
      const session = makeSession({ startedAt: daysAgo(0), taskId: task.id, durationMinutes: 45 });
      expect(cadenceDebt(p, [session], now(), [task])).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Properties over seeded random weeks, against an oracle that shares no code
// with the implementation.
// ---------------------------------------------------------------------------

interface Case {
  now: Date;
  project: ReturnType<typeof makeProject>;
  tasks: ReturnType<typeof makeTask>[];
  sessions: ReturnType<typeof makeSession>[];
}

function makeCase(random: ReturnType<typeof seeded>, zone: (typeof ZONES)[number]): Case {
  const anchorDay = random.pick(['2026-06-17', ...DST_WEEK_MONDAYS[zone]]);
  const nowDate = new Date(local(anchorDay, 0, 0).getTime() + random.int(0, 6 * 1440 + 1439) * 60_000);
  const byMinutes = random.chance(0.6);
  const project = makeProject({
    cadencePerWeek: random.int(1, 7),
    cadenceBlockMin: byMinutes ? random.int(1, 48) * 5 : null,
  });
  const other = makeProject({ cadencePerWeek: 3 });
  const tasks = [makeTask({ projectId: project.id }), makeTask({ projectId: other.id }), makeTask({ projectId: null })];

  const sessions = Array.from({ length: random.int(0, 14) }, () => {
    // From 10 days back to a day ahead; a third of them land within a minute of
    // local midnight, where day-boundary bugs live.
    const midnight = local(addDays(intlDayKey(nowDate, zone), -random.int(-1, 10)), 0, 0).getTime();
    const minuteOfDay = random.chance(0.33) ? random.pick([0, 1, 1438, 1439]) : random.int(0, 1439);
    const startedAt = new Date(midnight + minuteOfDay * 60_000);
    const link = random.pick(['project', 'task', 'other', 'none'] as const);
    const timed = random.chance(0.85);
    return makeSession({
      startedAt,
      projectId: link === 'project' ? project.id : link === 'other' ? other.id : null,
      taskId: link === 'task' ? tasks[0]!.id : null,
      durationMinutes: timed ? random.int(1, 240) / (random.chance(0.3) ? 2 : 1) : null,
      reps: timed ? null : 10,
    });
  });
  return { now: nowDate, project, tasks, sessions };
}

/** The oracle: window by Intl keys, debt by searching for the smallest cover. */
function oracleDebt(c: Case, zone: string): number {
  const wanted = c.project.cadencePerWeek ?? 0;
  const todayKey = intlDayKey(c.now, zone);
  const mine = c.sessions.filter((s) => {
    const belongs = s.projectId === c.project.id || (s.projectId == null && s.taskId === c.tasks[0]!.id);
    const age = keyDiff(intlDayKey(s.startedAt, zone), todayKey);
    return belongs && age >= 0 && age <= 6;
  });
  const block = c.project.cadenceBlockMin ?? null;
  if (block === null) return Math.max(0, wanted - mine.length);
  const credited = mine.reduce((sum, s) => sum + Math.min(s.durationMinutes ?? block, block), 0);
  for (let blocks = 0; blocks <= wanted; blocks += 1) {
    if (credited + blocks * block >= wanted * block - 1e-6) return blocks;
  }
  return wanted;
}

describe('cadence debt properties (seeded weeks, six zones, DST weeks included)', () => {
  for (const zone of ZONES) {
    it(`matches the oracle and keeps its invariants in ${zone}`, () => {
      inZone(zone, () => {
        const random = seeded(0xc0ffee ^ zone.length);
        for (let i = 0; i < 250; i += 1) {
          const c = makeCase(random, zone);
          const debt = cadenceDebt(c.project, c.sessions, c.now, c.tasks);
          const label = `${zone} case ${i} now=${c.now.toISOString()} cadence=${c.project.cadencePerWeek}x${c.project.cadenceBlockMin}`;

          expect(debt, label).toBe(oracleDebt(c, zone));
          expect(debt).toBeGreaterThanOrEqual(0);
          expect(debt).toBeLessThanOrEqual(c.project.cadencePerWeek!);
          expect(Number.isInteger(debt)).toBe(true);

          // Order does not matter.
          const shuffled = [...c.sessions].reverse();
          expect(cadenceDebt(c.project, shuffled, c.now, c.tasks), label).toBe(debt);

          // A session outside the window changes nothing.
          const old = makeSession({
            startedAt: local(addDays(intlDayKey(c.now, zone), -7), 12, 0),
            projectId: c.project.id,
            durationMinutes: 240,
          });
          expect(cadenceDebt(c.project, [...c.sessions, old], c.now, c.tasks), label).toBe(debt);

          // A full-block session today lowers the debt by exactly one, to a floor of zero.
          const fullBlock = makeSession({
            startedAt: local(intlDayKey(c.now, zone), 0, 0),
            projectId: c.project.id,
            durationMinutes: c.project.cadenceBlockMin ?? 20,
          });
          expect(cadenceDebt(c.project, [...c.sessions, fullBlock], c.now, c.tasks), label).toBe(
            Math.max(0, debt - 1),
          );

          // More work never raises it.
          const tiny = makeSession({
            startedAt: local(intlDayKey(c.now, zone), 0, 0),
            projectId: c.project.id,
            durationMinutes: 1,
          });
          expect(cadenceDebt(c.project, [...c.sessions, tiny], c.now, c.tasks), label).toBeLessThanOrEqual(debt);
        }
      });
    });
  }
});
