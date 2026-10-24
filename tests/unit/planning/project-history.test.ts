import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/pacing/days';
import { cadenceProgress, projectOfTaskIndex } from '@/lib/planning/cadence';
import {
  NEXT_TASKS_SHOWN,
  projectNextAction,
  projectSessions,
  projectSummaries,
  projectTimeline,
  rhythmLines,
  timeInvested,
  workedAgo,
} from '@/lib/planning/project-history';
import {
  DST_WEEK_MONDAYS,
  GUILT,
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

const NOW = () => local('2026-06-17', 10);
const daysAgo = (n: number, hour = 9, minute = 0) => local(addDays('2026-06-17', -n), hour, minute);

describe('projectSessions: which sessions belong to a project', () => {
  it('takes a session on the project, or on one of its tasks, and nothing else', () => {
    inZone('UTC', () => {
      const project = makeProject({});
      const other = makeProject({});
      const mine = makeTask({ projectId: project.id });
      const theirs = makeTask({ projectId: other.id });
      const direct = makeSession({ projectId: project.id, startedAt: daysAgo(3) });
      const viaTask = makeSession({ taskId: mine.id, projectId: null, startedAt: daysAgo(1) });
      const explicitWins = makeSession({ taskId: theirs.id, projectId: project.id, startedAt: daysAgo(2) });
      const notMine = [
        makeSession({ projectId: other.id, startedAt: daysAgo(1) }),
        makeSession({ taskId: theirs.id, projectId: null, startedAt: daysAgo(1) }),
        makeSession({ startedAt: daysAgo(1) }),
      ];
      const got = projectSessions(project.id, [direct, ...notMine, viaTask, explicitWins], [mine, theirs]);
      expect(got.map((s) => s.id)).toEqual([viaTask.id, explicitWins.id, direct.id]); // newest first
    });
  });

  it('orders ties by id and never changes its input', () => {
    inZone('UTC', () => {
      const project = makeProject({});
      const at = daysAgo(1);
      const a = makeSession({ projectId: project.id, startedAt: at });
      const b = makeSession({ projectId: project.id, startedAt: at });
      const input = [b, a];
      const got = projectSessions(project.id, input, []);
      expect(got.map((s) => s.id)).toEqual([a.id, b.id].sort());
      expect(input.map((s) => s.id)).toEqual([b.id, a.id]);
    });
  });
});

describe('timeInvested', () => {
  it('adds minutes (30-second precision), counts reps-only sessions as sessions with no minutes', () => {
    inZone('UTC', () => {
      const project = makeProject({});
      const sessions = [
        makeSession({ projectId: project.id, startedAt: daysAgo(0), durationMinutes: 22.5 }),
        makeSession({ projectId: project.id, startedAt: daysAgo(2), durationMinutes: 30 }),
        makeSession({ projectId: project.id, startedAt: daysAgo(9), durationMinutes: null, reps: 12 }),
        makeSession({ projectId: project.id, startedAt: daysAgo(20), durationMinutes: 45 }),
      ];
      const got = timeInvested(sessions, NOW());
      expect(got).toMatchObject({ sessions: 4, minutes: 97.5, thisWeekSessions: 2, thisWeekMinutes: 52.5 });
      expect(got.firstAt).toEqual(daysAgo(20));
      expect(got.lastAt).toEqual(daysAgo(0));
    });
  });

  it('has no first or last time for a project with no sessions', () => {
    expect(timeInvested([], NOW())).toEqual({
      sessions: 0, minutes: 0, thisWeekSessions: 0, thisWeekMinutes: 0, firstAt: null, lastAt: null,
    });
  });

  it('counts "this week" as the last seven local days, like cadence', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 3 });
      const sessions = [6, 7].map((n) => makeSession({ projectId: project.id, startedAt: daysAgo(n, 12) }));
      expect(timeInvested(sessions, NOW()).thisWeekSessions).toBe(1);
      expect(cadenceProgress(project, sessions, NOW()).sessions).toBe(1);
    });
  });
});

describe('projectTimeline', () => {
  it('groups by local day, newest first, and keeps sessions without a note', () => {
    inZone('Europe/Helsinki', () => {
      const project = makeProject({});
      const task = makeTask({ projectId: project.id });
      const sessions = [
        makeSession({ projectId: project.id, startedAt: daysAgo(0, 8), breadcrumb: '  Start with the intro  ', outcome: 'progress', durationMinutes: 25 }),
        makeSession({ taskId: task.id, projectId: null, startedAt: daysAgo(0, 18), breadcrumb: null, outcome: 'done', durationMinutes: 40 }),
        makeSession({ projectId: project.id, startedAt: daysAgo(3, 23, 30), breadcrumb: '   ', durationMinutes: null, reps: 8 }),
      ];
      const days = projectTimeline(sessions);
      expect(days.map((d) => d.dayKey)).toEqual(['2026-06-17', '2026-06-14']);
      const [today, earlier] = days as [typeof days[number], typeof days[number]];
      expect(today.entries.map((e) => [e.minutes, e.outcome, e.breadcrumb])).toEqual([
        [40, 'done', null], // 18:00 before 08:00
        [25, 'progress', 'Start with the intro'], // trimmed
      ]);
      expect(today.entries[0]!.taskId).toBe(task.id);
      expect(earlier.entries).toHaveLength(1);
      expect(earlier.entries[0]).toMatchObject({ minutes: null, reps: 8, breadcrumb: null }); // blank note is no note
    });
  });

  it('is empty for no sessions', () => {
    expect(projectTimeline([])).toEqual([]);
  });
});

describe('projectNextAction', () => {
  it('lists only this project\'s next tasks that are not deferred, most recently touched first', () => {
    inZone('UTC', () => {
      const project = makeProject({ breadcrumb: '  Review chapter 3  ' });
      const other = makeProject({});
      const t = (p: Partial<Parameters<typeof makeTask>[0]>) => makeTask({ projectId: project.id, ...p });
      const old = t({ title: 'old', touchedAt: daysAgo(9) });
      const fresh = t({ title: 'fresh', touchedAt: daysAgo(1) });
      const mid = t({ title: 'mid', touchedAt: daysAgo(4) });
      const deferred = t({ title: 'deferred', touchedAt: daysAgo(0), deferUntil: daysAgo(-3) });
      const releasedDefer = t({ title: 'released', touchedAt: daysAgo(2), deferUntil: daysAgo(1) });
      const notNext = [t({ status: 'inbox' }), t({ status: 'waiting' }), t({ status: 'done', doneAt: daysAgo(1) })];
      const foreign = makeTask({ projectId: other.id, touchedAt: daysAgo(0) });

      const got = projectNextAction(project, [old, fresh, mid, deferred, releasedDefer, foreign, ...notNext], NOW(), 10);
      expect(got.breadcrumb).toBe('Review chapter 3');
      expect(got.nextTasks.map((x) => x.title)).toEqual(['fresh', 'released', 'mid', 'old']);
    });
  });

  it('shows at most NEXT_TASKS_SHOWN by default, and null for a blank note', () => {
    inZone('UTC', () => {
      const project = makeProject({ breadcrumb: '   ' });
      const tasks = Array.from({ length: 7 }, (_, i) => makeTask({ projectId: project.id, touchedAt: daysAgo(i) }));
      const got = projectNextAction(project, tasks, NOW());
      expect(got.nextTasks).toHaveLength(NEXT_TASKS_SHOWN);
      expect(got.breadcrumb).toBeNull();
    });
  });
});

describe('workedAgo', () => {
  it('names the span in calm words at every boundary', () => {
    const cases: [number, string][] = [
      [0, 'Worked on today'], [1, 'Worked on yesterday'], [2, 'Worked on 2 days ago'], [6, 'Worked on 6 days ago'],
      [7, 'Worked on a week ago'], [13, 'Worked on a week ago'], [14, 'Worked on 2 weeks ago'], [59, 'Worked on 8 weeks ago'],
      [60, 'Worked on 2 months ago'], [171, 'Worked on 5 months ago'],
    ];
    for (const [days, words] of cases) expect(workedAgo(days), `${days} days`).toBe(words);
  });

  it('clamps nonsense to today and never uses a guilt word', () => {
    expect(workedAgo(-4)).toBe('Worked on today');
    expect(workedAgo(0.9)).toBe('Worked on today');
    for (let d = 0; d <= 800; d += 1) expect(workedAgo(d), `${d}`).not.toMatch(GUILT);
  });
});

describe('rhythmLines', () => {
  const lines = (project: ReturnType<typeof makeProject>, sessions: ReturnType<typeof makeSession>[] = []) =>
    rhythmLines(project, cadenceProgress(project, sessions, NOW()));

  it('says nothing for a project with no target', () => {
    expect(lines(makeProject({}))).toEqual({ target: null, week: null });
  });

  it('counts blocks for a plain rhythm, and says "kept" when the week is met', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 3 });
      const one = [makeSession({ projectId: project.id, startedAt: daysAgo(1), durationMinutes: 20 })];
      const three = [1, 2, 3].map((n) => makeSession({ projectId: project.id, startedAt: daysAgo(n) }));
      expect(lines(project)).toEqual({ target: '3 a week', week: 'This week: 0 of 3' });
      expect(lines(project, one)).toEqual({ target: '3 a week', week: 'This week: 1 of 3' });
      expect(lines(project, three).week).toBe('This week: kept');
    });
  });

  it('counts minutes for a rhythm with a block length', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 2, cadenceBlockMin: 45 });
      const s = (n: number, minutes: number) =>
        makeSession({ projectId: project.id, startedAt: daysAgo(n), durationMinutes: minutes });
      expect(lines(project, [s(1, 20)])).toEqual({ target: '2 a week, 45 min each', week: 'This week: 20 of 90 min' });
      expect(lines(project, [s(1, 45), s(2, 45)]).week).toBe('This week: kept');
    });
  });

  it('never uses a guilt word', () => {
    inZone('UTC', () => {
      for (const cadenceBlockMin of [null, 30]) {
        const project = makeProject({ cadencePerWeek: 4, cadenceBlockMin });
        for (let n = 0; n <= 5; n += 1) {
          const sessions = Array.from({ length: n }, (_, i) => makeSession({ projectId: project.id, startedAt: daysAgo(i), durationMinutes: 10 }));
          const { target, week } = lines(project, sessions);
          expect(`${target} ${week}`).not.toMatch(GUILT);
        }
      }
    });
  });
});

describe('projectSummaries: the project list', () => {
  it('lists active then paused, hides finished and let-go, most recently worked first', () => {
    inZone('UTC', () => {
      const quietActive = makeProject({ title: 'Quiet', lastTouchedAt: daysAgo(40) });
      const busyActive = makeProject({ title: 'Busy', lastTouchedAt: daysAgo(40) });
      const pausedRecent = makeProject({ title: 'Paused', status: 'paused', lastTouchedAt: daysAgo(1) });
      const done = makeProject({ title: 'Done', status: 'done', lastTouchedAt: daysAgo(1) });
      const dropped = makeProject({ title: 'Let go', status: 'dropped', lastTouchedAt: daysAgo(1) });
      const task = makeTask({ projectId: busyActive.id });
      const viaTask = makeSession({ taskId: task.id, projectId: null, startedAt: daysAgo(2) });

      const rows = projectSummaries({
        projects: [dropped, pausedRecent, quietActive, done, busyActive],
        sessions: [viaTask],
        tasks: [task],
        now: NOW(),
      });
      expect(rows.map((r) => r.project.title)).toEqual(['Busy', 'Quiet', 'Paused']);
      // Busy's number comes from the session on its TASK, not from lastTouchedAt (40 days ago).
      expect(rows.map((r) => r.daysQuiet)).toEqual([2, 40, 1]);
      expect(rows[0]!.nextCount).toBe(1);
    });
  });

  it('is the same for any input order and carries the shared cadence progress', () => {
    inZone('UTC', () => {
      const a = makeProject({ title: 'A', cadencePerWeek: 2, cadenceBlockMin: 45, lastTouchedAt: daysAgo(5) });
      const b = makeProject({ title: 'B', lastTouchedAt: daysAgo(5) });
      const task = makeTask({ projectId: a.id });
      const sessions = [makeSession({ taskId: task.id, projectId: null, startedAt: daysAgo(1), durationMinutes: 10 })];
      const forward = projectSummaries({ projects: [a, b], sessions, tasks: [task], now: NOW() });
      const backward = projectSummaries({ projects: [b, a], sessions: [...sessions].reverse(), tasks: [task], now: NOW() });
      expect(backward.map((r) => r.project.id)).toEqual(forward.map((r) => r.project.id));
      const ofA = forward.find((r) => r.project.id === a.id)!;
      expect(ofA.progress).toEqual(cadenceProgress(a, sessions, NOW(), projectOfTaskIndex([task])));
      expect(ofA.progress.debt).toBe(2); // 10 of 90 minutes
    });
  });
});

describe('simulated histories against an independent oracle (six zones, DST weeks included)', () => {
  for (const zone of ZONES) {
    it(`timeline days, this-week totals and ordering agree in ${zone}`, () => {
      inZone(zone, () => {
        const random = seeded(0xb10c ^ zone.length);
        for (let i = 0; i < 80; i += 1) {
          const dstMonday = random.pick(DST_WEEK_MONDAYS[zone]);
          const now = new Date(local(addDays(dstMonday, random.int(0, 6)), 12).getTime() + random.int(-400, 400) * 60_000);
          const todayKey = intlDayKey(now, zone);

          const project = makeProject({});
          const task = makeTask({ projectId: project.id });
          const other = makeProject({});
          const sessions = Array.from({ length: random.int(0, 14) }, () => {
            const midnight = local(addDays(todayKey, -random.int(0, 20)), 0, 0).getTime();
            const minute = random.chance(0.3) ? random.pick([0, 1, 1438, 1439]) : random.int(0, 1439);
            const link = random.pick(['direct', 'task', 'other', 'none'] as const);
            const timed = random.chance(0.85);
            return makeSession({
              startedAt: new Date(midnight + minute * 60_000),
              projectId: link === 'direct' ? project.id : link === 'other' ? other.id : null,
              taskId: link === 'task' ? task.id : null,
              // exactly one of minutes / reps, as the schema requires
              durationMinutes: timed ? random.int(1, 120) : null,
              reps: timed ? null : 9,
            });
          });
          const fixed = sessions;

          const mine = projectSessions(project.id, fixed, [task]);
          const expectedMine = fixed.filter((s) => s.projectId === project.id || (s.projectId == null && s.taskId === task.id));
          expect(new Set(mine.map((s) => s.id))).toEqual(new Set(expectedMine.map((s) => s.id)));
          expect(mine).toHaveLength(expectedMine.length);

          const days = projectTimeline(mine);
          // Every session appears exactly once, under the day an independent oracle gives it.
          const flat = days.flatMap((d) => d.entries);
          expect(flat).toHaveLength(mine.length);
          for (const day of days) {
            for (const entry of day.entries) {
              expect(day.dayKey, `${zone} ${entry.at.toISOString()}`).toBe(intlDayKey(entry.at, zone));
            }
          }
          // Days strictly descending; entries within a day newest first.
          for (let d = 1; d < days.length; d += 1) expect(days[d - 1]!.dayKey > days[d]!.dayKey).toBe(true);
          for (const day of days) {
            for (let e = 1; e < day.entries.length; e += 1) {
              expect(day.entries[e - 1]!.at.getTime()).toBeGreaterThanOrEqual(day.entries[e]!.at.getTime());
            }
          }

          const invested = timeInvested(mine, now);
          const inWeek = mine.filter((s) => {
            const age = keyDiff(intlDayKey(s.startedAt, zone), todayKey);
            return age >= 0 && age <= 6;
          });
          expect(invested.thisWeekSessions, `${zone} case ${i}`).toBe(inWeek.length);
          expect(invested.sessions).toBe(mine.length);
          const total = mine.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
          expect(invested.minutes).toBeCloseTo(total, 5);
        }
      });
    });
  }
});
