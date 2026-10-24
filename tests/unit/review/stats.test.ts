import { afterEach, describe, expect, it } from 'vitest';
import { summarizeWeek, WeeklyStatsSchema, WAITING_DAYS } from '@/lib/review/stats';
import { WeekKeySchema, weekKeyFor, weekRange } from '@/lib/review/week';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';
import type { Domain } from '@/lib/schemas/domain';
import type { WeeklyStatsInput } from '@/lib/review/stats';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});
function useTz(tz: string): void {
  process.env.TZ = tz;
}

const H = 3_600_000;
const TRADING = '11111111-1111-4111-8111-111111111111';
const PRACTICE = '22222222-2222-4222-8222-222222222222';
const CAREER = '33333333-3333-4333-8333-333333333333';
const LIGHT = '44444444-4444-4444-8444-444444444444';
const P_TRADING = '51111111-1111-4111-8111-111111111111';
const P_CAREER = '52222222-2222-4222-8222-222222222222';
const P_PAUSED = '53333333-3333-4333-8333-333333333333';
const T_ESTIMATED = '61111111-1111-4111-8111-111111111111';
const T_OUTSIDE = '62222222-2222-4222-8222-222222222222';
const T_NO_ESTIMATE = '63333333-3333-4333-8333-333333333333';
const T_WAITING = '64444444-4444-4444-8444-444444444444';
const T_SECOND_WAITING = '65555555-5555-4555-8555-555555555555';
const T_FRESH = '66666666-6666-4666-8666-666666666666';

function domain(id: string, name: string, order: number): Domain {
  const t = new Date('2026-01-01T00:00:00Z');
  return { id, name, order, createdAt: t, updatedAt: t };
}

function project(id: string, patch: Partial<Project>): Project {
  const t = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    title: id,
    domainId: null,
    status: 'active',
    cadencePerWeek: null,
    breadcrumb: null,
    lastTouchedAt: t,
    createdAt: t,
    updatedAt: t,
    ...patch,
  };
}

function task(id: string, patch: Partial<Task>): Task {
  const t = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    title: id,
    status: 'next',
    source: 'manual',
    createdAt: t,
    touchedAt: t,
    ...patch,
  } as Task;
}

function session(patch: Partial<Session> & { id: string; startedAt: Date }): Session {
  return {
    rating: 4,
    durationMinutes: 30,
    reps: null,
    createdAt: patch.startedAt,
    updatedAt: patch.startedAt,
    ...patch,
  } as Session;
}

function weekInput(
  patch: Partial<Omit<WeeklyStatsInput, 'weekOf' | 'now'>> & { weekOf: string; now: Date },
): WeeklyStatsInput {
  return { sessions: [], tasks: [], projects: [], domains: [], ...patch };
}

describe('week identity', () => {
  it('names a week by its local Monday, in the local calendar', () => {
    useTz('Asia/Kolkata');
    expect(weekKeyFor(new Date(2026, 5, 17, 9, 0))).toBe('2026-06-15'); // Wednesday
    expect(weekKeyFor(new Date(2026, 5, 21, 23, 30))).toBe('2026-06-15'); // Sunday night
    expect(weekKeyFor(new Date(2026, 5, 22, 0, 30))).toBe('2026-06-22'); // Monday just after midnight

    // A +14 zone: the same instant can be a different local week.
    useTz('Pacific/Kiritimati');
    expect(weekKeyFor(new Date(2026, 5, 21, 23, 30))).toBe('2026-06-15');
    expect(weekKeyFor(new Date(2026, 5, 22, 0, 15))).toBe('2026-06-22');
  });

  it('crosses the year boundary inside one week', () => {
    useTz('UTC');
    expect(weekKeyFor(new Date(2026, 11, 31, 12, 0))).toBe('2026-12-28'); // Thursday
    expect(weekKeyFor(new Date(2027, 0, 3, 12, 0))).toBe('2026-12-28'); // Sunday
    expect(weekKeyFor(new Date(2027, 0, 4, 0, 0))).toBe('2027-01-04'); // Monday
  });

  it('rejects day keys that are not a real Monday', () => {
    expect(WeekKeySchema.safeParse('2026-06-15').success).toBe(true);
    expect(WeekKeySchema.safeParse('2026-06-17').success).toBe(false); // Wednesday
    expect(WeekKeySchema.safeParse('11/06/2026').success).toBe(false);
    expect(WeekKeySchema.safeParse('2026-02-31').success).toBe(false); // not a calendar date
  });

  it('normalises any day inside the week to the same week range', () => {
    useTz('Europe/Helsinki');
    expect(weekRange('2026-06-17')).toEqual(weekRange('2026-06-15'));
    expect(weekRange('2026-06-21')).toEqual(weekRange('2026-06-15'));
  });

  it('keeps the real length of DST weeks (Helsinki, Los Angeles, Auckland)', () => {
    useTz('Europe/Helsinki');
    expect((weekRange('2026-03-23').end - weekRange('2026-03-23').start) / H).toBe(167);
    expect((weekRange('2026-10-19').end - weekRange('2026-10-19').start) / H).toBe(169);

    useTz('America/Los_Angeles');
    expect((weekRange('2026-03-02').end - weekRange('2026-03-02').start) / H).toBe(167);
    expect((weekRange('2026-10-26').end - weekRange('2026-10-26').start) / H).toBe(169);

    useTz('Pacific/Auckland');
    expect((weekRange('2026-03-30').end - weekRange('2026-03-30').start) / H).toBe(169);
    expect((weekRange('2026-09-21').end - weekRange('2026-09-21').start) / H).toBe(167);
  });

  it('starts and ends at local midnight in a half-hour zone', () => {
    useTz('Asia/Kolkata');
    const { start, end } = weekRange('2026-06-15');
    expect([new Date(start).getHours(), new Date(start).getMinutes()]).toEqual([0, 0]);
    expect([new Date(end).getHours(), new Date(end).getMinutes()]).toEqual([0, 0]);
  });

  it('counts a Sunday-night session in the week and drops Monday midnight', () => {
    useTz('Europe/Helsinki'); // fall back on Sunday 2026-10-25
    const weekOf = '2026-10-19';
    const sundayNight = session({ id: '71111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 9, 25, 23, 59) });
    const nextMonday = session({ id: '72222222-2222-4222-8222-222222222222', startedAt: new Date(2026, 9, 26, 0, 0) });
    const stats = summarizeWeek(weekInput({ weekOf, sessions: [sundayNight, nextMonday], now: new Date(2026, 9, 26, 9) }));
    expect(stats.sessions.total).toBe(1);
    expect(stats.sessions.minutes).toBe(30);
  });
});

const WEEK = '2026-06-15';
// A fixed instant, not a local wall clock: the tests switch TZ per case, so a
// module-level local-time parse would land on a different local day per zone.
const NOW = new Date('2026-06-21T12:00:00Z');

describe('domain balance', () => {
  it('shows every domain, with intentions and untouched areas', () => {
    useTz('Europe/Helsinki');
    const domains = [domain(TRADING, 'Trading', 0), domain(PRACTICE, 'Practice', 1), domain(CAREER, 'Career/Build', 2), domain(LIGHT, 'Life admin', 3)];
    const projects = [
      project(P_TRADING, { domainId: TRADING }),
      project(P_CAREER, { domainId: CAREER }),
    ];
    const stats = summarizeWeek(weekInput({
      weekOf: WEEK,
      now: NOW,
      domains,
      projects,
      intentions: { [TRADING]: 240, [PRACTICE]: 90 },
      sessions: [
        // Task-linked: the task's domain wins.
        session({ id: '81111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 5, 16, 9), durationMinutes: 45, taskId: T_ESTIMATED }),
        // Project-linked only.
        session({ id: '82222222-2222-4222-8222-222222222222', startedAt: new Date(2026, 5, 17, 9), durationMinutes: 30, projectId: P_TRADING }),
        // Nothing linked: still counted as week minutes, not as a domain.
        session({ id: '83333333-3333-4333-8333-333333333333', startedAt: new Date(2026, 5, 18, 9), durationMinutes: 20 }),
        // Outside the week.
        session({ id: '84444444-4444-4444-8444-444444444444', startedAt: new Date(2026, 5, 8, 9), durationMinutes: 60, projectId: P_TRADING }),
      ],
      tasks: [task(T_ESTIMATED, { domainId: TRADING, projectId: P_CAREER, estimateMin: 30 })],
    }));

    expect(stats.domainBalance).toEqual([
      { domainId: TRADING, minutes: 75, intended: 240, delta: -165 },
      { domainId: PRACTICE, minutes: 0, intended: 90, delta: -90 },
      { domainId: CAREER, minutes: 0, intended: null, delta: null },
      { domainId: LIGHT, minutes: 0, intended: null, delta: null },
    ]);
    expect(stats.unassignedMinutes).toBe(20);
    expect(stats.sessions.minutes).toBe(95);
  });
});

describe('estimate vs actual', () => {
  it('compares this week only, from the sessions, not the lifetime cache', () => {
    useTz('UTC');
    const stats = summarizeWeek(weekInput({
      weekOf: WEEK,
      now: NOW,
      sessions: [
        session({ id: '91111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 5, 16, 9), durationMinutes: 45, taskId: T_ESTIMATED }),
        // Same task, earlier week: the lifetime cache says 105, this week says 45.
        session({ id: '92222222-2222-4222-8222-222222222222', startedAt: new Date(2026, 5, 9, 9), durationMinutes: 60, taskId: T_ESTIMATED }),
        // No estimate on the task: its minutes count, the estimate is reported as missing.
        session({ id: '93333333-3333-4333-8333-333333333333', startedAt: new Date(2026, 5, 17, 9), durationMinutes: 20, taskId: T_NO_ESTIMATE }),
        // A reps-only session has no minutes to compare.
        session({ id: '94444444-4444-4444-8444-444444444444', startedAt: new Date(2026, 5, 18, 9), durationMinutes: null, reps: 20, taskId: T_NO_ESTIMATE }),
        // Work on a third task that did not happen this week contributes nothing.
        session({ id: '95555555-5555-4555-8555-555555555555', startedAt: new Date(2026, 5, 1, 9), durationMinutes: 30, taskId: T_OUTSIDE }),
      ],
      tasks: [
        task(T_ESTIMATED, { estimateMin: 30, actualMin: 105 }),
        task(T_OUTSIDE, { estimateMin: 30, actualMin: 30 }),
        task(T_NO_ESTIMATE, { estimateMin: null, actualMin: 20 }),
      ],
    }));
    expect(stats.estimateVsActual).toEqual({
      estimatedMin: 30, // the one measured task that has an estimate, counted once
      actualMin: 65, // 45 + 20, this week only
      deltaMin: 35,
      tasks: 2,
      tasksWithoutEstimate: 1,
    });
  });
});

describe('waiting tasks', () => {
  it('starts at 14 untouched local days, inclusive', () => {
    useTz('UTC');
    const atBoundary = task(T_WAITING, { touchedAt: new Date(2026, 5, 7, 12, 0) });
    const oneDayShort = task(T_FRESH, { touchedAt: new Date(2026, 5, 8, 12, 0) });
    const stats = summarizeWeek(weekInput({ weekOf: WEEK, now: NOW, tasks: [atBoundary, oneDayShort] }));
    expect(WAITING_DAYS).toBe(14);
    expect(stats.waitingTaskIds).toEqual([T_WAITING]);
  });

  it('counts local days, so a DST week does not delay it by an hour', () => {
    useTz('Europe/Helsinki'); // spring forward on Sunday 2026-03-29
    const touched = task(T_WAITING, { touchedAt: new Date(2026, 2, 16, 9, 0) });
    const now = new Date(2026, 2, 30, 8, 30); // 13d 22.5h of elapsed time, 14 local days
    expect(now.getTime() - touched.touchedAt.getTime()).toBeLessThan(14 * 24 * H);
    const stats = summarizeWeek(weekInput({ weekOf: weekKeyFor(now), now, tasks: [touched] }));
    expect(stats.waitingTaskIds).toEqual([T_WAITING]);
  });

  it('leaves out deferred tasks and tasks that are not `next`', () => {
    useTz('UTC');
    const deferred = task(T_WAITING, { touchedAt: new Date(2026, 4, 1), deferUntil: new Date(2026, 6, 1) });
    const deferredLongAgo = task(T_SECOND_WAITING, { touchedAt: new Date(2026, 4, 1), deferUntil: new Date(2026, 5, 1) });
    const done = task(T_FRESH, { touchedAt: new Date(2026, 4, 1), status: 'done', doneAt: new Date(2026, 4, 2) });
    const stats = summarizeWeek(weekInput({ weekOf: WEEK, now: NOW, tasks: [deferred, deferredLongAgo, done] }));
    expect(stats.waitingTaskIds).toEqual([T_SECOND_WAITING]);
  });

  it('is deterministic when several tasks are waiting', () => {
    useTz('UTC');
    const early = new Date(2026, 4, 1);
    const stats = summarizeWeek(
      weekInput({
        weekOf: WEEK,
        now: NOW,
        tasks: [task(T_SECOND_WAITING, { touchedAt: early }), task(T_WAITING, { touchedAt: early })],
      }),
    );
    expect(stats.waitingTaskIds).toEqual([T_WAITING, T_SECOND_WAITING].sort());
  });
});

describe('projects and cadence', () => {
  it('measures cadence over the reviewed week, not the days before now', () => {
    useTz('Europe/Helsinki');
    const projects = [
      project(P_CAREER, { domainId: CAREER, cadencePerWeek: 3, lastTouchedAt: new Date(2026, 5, 18, 9) }),
      project(P_PAUSED, { domainId: CAREER, cadencePerWeek: 3, status: 'paused' }),
      project(P_TRADING, { domainId: TRADING, cadencePerWeek: null }),
    ];
    const sessions = [
      session({ id: 'a1111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 5, 16, 9), projectId: P_CAREER }),
      session({ id: 'a2222222-2222-4222-8222-222222222222', startedAt: new Date(2026, 5, 19, 9), projectId: P_CAREER }),
    ];
    const thisWeek = summarizeWeek(weekInput({ weekOf: WEEK, now: NOW, projects, sessions }));
    expect(thisWeek.projects).toEqual([
      // 2, not 3: daysSinceTouched counts from the last WORK, and the session on
      // the 19th is later than the project's own lastTouchedAt (the 18th).
      { projectId: P_CAREER, status: 'active', sessionsThisWeek: 2, cadenceDebt: 1, daysSinceTouched: 2 },
      { projectId: P_TRADING, status: 'active', sessionsThisWeek: 0, cadenceDebt: 0, daysSinceTouched: 171 },
      { projectId: P_PAUSED, status: 'paused', sessionsThisWeek: 0, cadenceDebt: 0, daysSinceTouched: 171 },
    ]);

    // Reviewing the same week a month later must not change its week-anchored
    // numbers. `daysSinceTouched` is relative to "now" by design.
    const later = summarizeWeek(weekInput({ weekOf: WEEK, now: new Date(2026, 6, 20, 12), projects, sessions }));
    const anchored = (rows: typeof later.projects) =>
      rows.map(({ projectId, status, sessionsThisWeek, cadenceDebt }) => ({ projectId, status, sessionsThisWeek, cadenceDebt }));
    expect(anchored(later.projects)).toEqual(anchored(thisWeek.projects));
    expect(later.weekStart).toBe(thisWeek.weekStart);
  });
});

describe('project attribution through the task', () => {
  it('counts work done on a project task even when the session has no projectId', () => {
    useTz('Europe/Helsinki');
    const projects = [project(P_CAREER, { domainId: CAREER, cadencePerWeek: 2 })];
    const taskOnProject = task(T_ESTIMATED, { domainId: CAREER, projectId: P_CAREER, estimateMin: 30 });
    // Every Start button opens a session with a task only (WorkingOnPicker is
    // exclusive), so this is what real work on a project looks like.
    const stats = summarizeWeek(
      weekInput({
        weekOf: WEEK,
        now: NOW,
        projects,
        domains: [domain(CAREER, 'Career/Build', 0)],
        tasks: [taskOnProject],
        sessions: [
          session({
            id: 'd1111111-1111-4111-8111-111111111111',
            startedAt: new Date(2026, 5, 16, 9),
            durationMinutes: 30,
            taskId: T_ESTIMATED,
          }),
        ],
      }),
    );
    expect(stats.projects).toEqual([
      // 5, not 171: the project's lastTouchedAt never saw this task-linked
      // session, but it is work on the project (the 16th, five days before NOW).
      { projectId: P_CAREER, status: 'active', sessionsThisWeek: 1, cadenceDebt: 1, daysSinceTouched: 5 },
    ]);
    expect(stats.sessions.total).toBe(1);
    expect(stats.domainBalance).toEqual([
      { domainId: CAREER, minutes: 30, intended: null, delta: null },
    ]);
  });

  it('keeps the session project when it has both ids, and leaves an unlinked session unattributed', () => {
    useTz('UTC');
    const projects = [
      project(P_TRADING, { domainId: TRADING, cadencePerWeek: 2 }),
      project(P_CAREER, { domainId: CAREER, cadencePerWeek: 2 }),
    ];
    // The task belongs to P_CAREER, but the session was linked to P_TRADING: the
    // session's own link is the more specific choice.
    const taskOnCareer = task(T_ESTIMATED, { domainId: CAREER, projectId: P_CAREER });
    const stats = summarizeWeek(
      weekInput({
        weekOf: WEEK,
        now: NOW,
        projects,
        tasks: [taskOnCareer],
        sessions: [
          session({
            id: 'd2222222-2222-4222-8222-222222222222',
            startedAt: new Date(2026, 5, 16, 9),
            taskId: T_ESTIMATED,
            projectId: P_TRADING,
          }),
          // Neither link: it must not be charged to any project.
          session({ id: 'd3333333-3333-4333-8333-333333333333', startedAt: new Date(2026, 5, 17, 9) }),
        ],
      }),
    );
    const byProject = new Map(stats.projects.map((row) => [row.projectId, row] as const));
    expect(byProject.get(P_TRADING)?.sessionsThisWeek).toBe(1);
    expect(byProject.get(P_CAREER)?.sessionsThisWeek).toBe(0);
    expect(byProject.get(P_CAREER)?.cadenceDebt).toBe(2);
  });

  it('gives the same answer whatever order the sessions arrive in', () => {
    useTz('Europe/Helsinki');
    const projects = [project(P_CAREER, { domainId: CAREER, cadencePerWeek: 3 })];
    const tasks = [task(T_ESTIMATED, { domainId: CAREER, projectId: P_CAREER })];
    const sessions = [
      session({ id: 'd4444444-4444-4444-8444-444444444444', startedAt: new Date(2026, 5, 16, 9), taskId: T_ESTIMATED, outcome: 'done' }),
      session({ id: 'd5555555-5555-4555-8555-555555555555', startedAt: new Date(2026, 5, 17, 9), projectId: P_CAREER, outcome: 'blocked' }),
      session({ id: 'd6666666-6666-4666-8666-666666666666', startedAt: new Date(2026, 5, 18, 9), outcome: 'progress' }),
    ];
    const forward = summarizeWeek(weekInput({ weekOf: WEEK, now: NOW, projects, tasks, sessions }));
    const reversed = summarizeWeek(
      weekInput({ weekOf: WEEK, now: NOW, projects, tasks, sessions: [...sessions].reverse() }),
    );
    expect(reversed).toEqual(forward);
    expect(forward.projects[0]?.sessionsThisWeek).toBe(2);
  });
});

describe('sessions: what moved and what stalled', () => {
  it('counts outcomes without treating a blocked session as a failure', () => {
    useTz('UTC');
    const stats = summarizeWeek(weekInput({
      weekOf: WEEK,
      now: NOW,
      sessions: [
        session({ id: 'b1111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 5, 16, 9), outcome: 'done' }),
        session({ id: 'b2222222-2222-4222-8222-222222222222', startedAt: new Date(2026, 5, 17, 9), outcome: 'progress', durationMinutes: 15.5 }),
        session({ id: 'b3333333-3333-4333-8333-333333333333', startedAt: new Date(2026, 5, 18, 9), outcome: 'blocked' }),
        session({ id: 'b4444444-4444-4444-8444-444444444444', startedAt: new Date(2026, 5, 19, 9), durationMinutes: null, reps: 25 }),
      ],
    }));
    expect(stats.sessions).toEqual({ total: 4, moved: 2, stalled: 1, withoutOutcome: 1, minutes: 75.5 });
  });
});

describe('snapshot agreement', () => {
  it('is deterministic and validates as a stored stats snapshot', () => {
    useTz('Asia/Kolkata');
    const input = {
      weekOf: WEEK,
      now: NOW,
      domains: [domain(TRADING, 'Trading', 0)],
      projects: [project(P_TRADING, { domainId: TRADING, cadencePerWeek: 2 })],
      tasks: [task(T_WAITING, { domainId: TRADING, touchedAt: new Date(2026, 4, 1) })],
      intentions: { [TRADING]: 120 },
      sessions: [
        session({ id: 'c1111111-1111-4111-8111-111111111111', startedAt: new Date(2026, 5, 16, 9), durationMinutes: 40, taskId: T_WAITING, projectId: P_TRADING, outcome: 'done' }),
      ],
    };
    const first = summarizeWeek(input);
    expect(summarizeWeek({ ...input })).toEqual(first);
    expect(WeeklyStatsSchema.safeParse(first).success).toBe(true);
    expect(first.weekOf).toBe(WEEK);
    expect(first.weekStart).toBeLessThan(first.weekEnd);
  });
});
