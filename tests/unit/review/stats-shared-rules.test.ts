/**
 * The weekly review and the planner must not disagree about what a day is, what
 * work on a project is, or how much of a rhythm a week has met. They share those
 * rules (planning/untouched.ts, planning/cadence.ts); these tests pin the review
 * to them from the review's side. d1's own stats tests are untouched.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/pacing/days';
import { cadenceDebt } from '@/lib/planning/cadence';
import { detectStalls } from '@/lib/planning/stall';
import { isUntouchedFor, WAITING_AFTER_DAYS } from '@/lib/planning/untouched';
import { summarizeWeek } from '@/lib/review/stats';
import type { Domain } from '@/lib/schemas/domain';
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
} from '../planning/w10-helpers';

const CAREER = '33333333-3333-4333-8333-333333333333';
const WEEK = '2026-06-15'; // a Monday

function domain(id: string, name: string, order: number): Domain {
  const t = new Date('2026-01-01T00:00:00Z');
  return { id, name, order, createdAt: t, updatedAt: t };
}

describe('the review attributes work through the task, like the planner does', () => {
  it('counts time on a task with no domain toward its PROJECT\'s domain', () => {
    inZone('UTC', () => {
      const project = makeProject({ domainId: CAREER });
      const task = makeTask({ projectId: project.id, domainId: null });
      // A Start button links the task only: no projectId on the session.
      const session = makeSession({ taskId: task.id, projectId: null, startedAt: local('2026-06-17', 10), durationMinutes: 30 });

      const stats = summarizeWeek({
        weekOf: WEEK,
        now: local('2026-06-21', 18),
        sessions: [session],
        tasks: [task],
        projects: [project],
        domains: [domain(CAREER, 'Career', 0)],
      });

      expect(stats.domainBalance).toMatchObject([{ domainId: CAREER, minutes: 30 }]);
      expect(stats.unassignedMinutes).toBe(0);
    });
  });
});

describe('the review\'s cadence debt is the planner\'s cadence debt', () => {
  it('weighs a short task session by its minutes when the project counts by minutes', () => {
    inZone('UTC', () => {
      const project = makeProject({ cadencePerWeek: 2, cadenceBlockMin: 45 });
      const task = makeTask({ projectId: project.id });
      const session = makeSession({ taskId: task.id, projectId: null, startedAt: local('2026-06-17', 10), durationMinutes: 10 });
      const now = local('2026-06-21', 18);

      const stats = summarizeWeek({ weekOf: WEEK, now, sessions: [session], tasks: [task], projects: [project], domains: [] });

      // 10 of 90 minutes: two blocks still wanted. Counting sessions would say one.
      expect(stats.projects).toMatchObject([{ projectId: project.id, sessionsThisWeek: 1, cadenceDebt: 2 }]);
      // And it is exactly what the planner reports for that same Sunday-noon week.
      const sundayNoon = local('2026-06-21', 12);
      expect(cadenceDebt(project, [session], sundayNoon, [task])).toBe(2);
    });
  });
});

describe('the review\'s "waiting" is the shared untouched rule', () => {
  for (const zone of ZONES) {
    it(`agrees with isUntouchedFor and with an Intl oracle in ${zone} (200 tasks, DST weeks included)`, () => {
      inZone(zone, () => {
        const random = seeded(0xfeed ^ zone.length);
        for (const dstMonday of DST_WEEK_MONDAYS[zone]) {
          const now = new Date(local(addDays(dstMonday, 6), 12).getTime() + random.int(-300, 300) * 60_000);
          const todayKey = intlDayKey(now, zone);
          const tasks = Array.from({ length: 200 }, () => {
            // Touches clustered around the 14 day boundary, any minute, midnight edges included.
            const midnight = local(addDays(todayKey, -WAITING_AFTER_DAYS + random.int(-2, 2)), 0, 0).getTime();
            const minute = random.chance(0.3) ? random.pick([0, 1, 1438, 1439]) : random.int(0, 1439);
            return makeTask({ status: 'next', touchedAt: new Date(midnight + minute * 60_000) });
          });

          const stats = summarizeWeek({ weekOf: todayKey, now, sessions: [], tasks, projects: [], domains: [] });
          const reported = new Set(stats.waitingTaskIds);

          for (const task of tasks) {
            const oracle = keyDiff(intlDayKey(task.touchedAt, zone), todayKey) >= WAITING_AFTER_DAYS;
            expect(reported.has(task.id), `${zone} ${task.touchedAt.toISOString()} vs ${now.toISOString()}`).toBe(oracle);
            expect(isUntouchedFor(task.touchedAt, now, WAITING_AFTER_DAYS)).toBe(oracle);
          }
          // The boundary is really exercised: some waiting, some not.
          expect(reported.size).toBeGreaterThan(0);
          expect(reported.size).toBeLessThan(tasks.length);
        }
      });
    });
  }
});

describe('daysSinceTouched is days since the last WORK, the stall detector\'s rule', () => {
  const NOW = () => local('2026-06-21', 15);
  const daysFor = (
    project: ReturnType<typeof makeProject>,
    extra: { sessions?: ReturnType<typeof makeSession>[]; tasks?: ReturnType<typeof makeTask>[] } = {},
  ) =>
    summarizeWeek({
      weekOf: WEEK,
      now: NOW(),
      sessions: extra.sessions ?? [],
      tasks: extra.tasks ?? [],
      projects: [project],
      domains: [],
    }).projects.find((row) => row.projectId === project.id)!.daysSinceTouched;

  it('falls back to the project\'s own lastTouchedAt when there is no work', () => {
    inZone('UTC', () => {
      expect(daysFor(makeProject({ lastTouchedAt: local('2026-06-11', 9) }))).toBe(10);
    });
  });

  it('sees a session spent on one of the project\'s TASKS, which lastTouchedAt never did', () => {
    inZone('UTC', () => {
      const project = makeProject({ lastTouchedAt: local('2026-03-01', 9) });
      const task = makeTask({ projectId: project.id });
      const viaTask = makeSession({ taskId: task.id, projectId: null, startedAt: local('2026-06-18', 9) });
      expect(daysFor(project, { sessions: [viaTask], tasks: [task] })).toBe(3);
    });
  });

  it('counts a session on the project itself, from when it ended', () => {
    inZone('UTC', () => {
      const project = makeProject({ lastTouchedAt: local('2026-03-01', 9) });
      const direct = makeSession({ projectId: project.id, startedAt: local('2026-06-10', 23), endedAt: local('2026-06-11', 0, 30) });
      expect(daysFor(project, { sessions: [direct] })).toBe(10); // from the 11th, when it ended
    });
  });

  it('counts a finished task of the project, but not one that was only looked at', () => {
    inZone('UTC', () => {
      const project = makeProject({ lastTouchedAt: local('2026-03-01', 9) });
      const finished = makeTask({ projectId: project.id, status: 'done', doneAt: local('2026-06-17', 9), touchedAt: local('2026-06-17', 9) });
      const looked = makeTask({ projectId: project.id, status: 'next', touchedAt: local('2026-06-20', 9) });
      expect(daysFor(project, { tasks: [looked] })).toBe(112); // triage is not work
      expect(daysFor(project, { tasks: [looked, finished] })).toBe(4);
    });
  });

  it('is exactly the stall detector\'s number for a project that has gone quiet', () => {
    inZone('Europe/Helsinki', () => {
      const project = makeProject({ stallAfterDays: 3, lastTouchedAt: local('2026-05-01', 9) });
      const task = makeTask({ projectId: project.id });
      const session = makeSession({ taskId: task.id, projectId: null, startedAt: local('2026-06-09', 9) });
      const stalls = detectStalls({ projects: [project], sessions: [session], tasks: [task], now: NOW() });
      expect(stalls).toHaveLength(1);
      expect(daysFor(project, { sessions: [session], tasks: [task] })).toBe(stalls[0]!.daysQuiet);
      expect(stalls[0]!.daysQuiet).toBe(12);
    });
  });

  for (const zone of ZONES) {
    it(`matches an independent oracle in ${zone} (120 random histories, DST weeks included)`, () => {
      inZone(zone, () => {
        const random = seeded(0xabc ^ zone.length);
        for (let i = 0; i < 120; i += 1) {
          const dstMonday = random.pick(DST_WEEK_MONDAYS[zone]);
          const now = new Date(local(addDays(dstMonday, random.int(0, 6)), 12).getTime() + random.int(-400, 400) * 60_000);
          const todayKey = intlDayKey(now, zone);
          const at = (back: number) =>
            new Date(local(addDays(todayKey, -back), 0, 0).getTime() + (random.chance(0.3) ? random.pick([0, 1, 1438, 1439]) : random.int(0, 1439)) * 60_000);

          const project = makeProject({ lastTouchedAt: at(random.int(0, 60)) });
          const other = makeProject({ lastTouchedAt: at(random.int(0, 60)) });
          const mine = makeTask({ projectId: project.id, status: 'next', touchedAt: at(random.int(0, 5)) });
          const finished = random.chance(0.5)
            ? makeTask({ projectId: project.id, status: 'done', doneAt: at(random.int(0, 50)), touchedAt: at(random.int(0, 50)) })
            : null;
          const theirs = makeTask({ projectId: other.id, status: 'done', doneAt: at(random.int(0, 3)), touchedAt: at(random.int(0, 3)) });
          const tasks = [mine, theirs, ...(finished ? [finished] : [])];
          const sessions = Array.from({ length: random.int(0, 5) }, () => {
            const link = random.pick(['direct', 'task', 'other', 'none'] as const);
            const startedAt = at(random.int(0, 50));
            return makeSession({
              startedAt,
              endedAt: random.chance(0.4) ? new Date(startedAt.getTime() + random.int(5, 90) * 60_000) : null,
              projectId: link === 'direct' ? project.id : link === 'other' ? other.id : null,
              taskId: link === 'task' ? mine.id : null,
            });
          });

          // The oracle: brute-force the latest instant of work, then count Intl days.
          const instants = [project.lastTouchedAt.getTime()];
          for (const session of sessions) {
            if (session.projectId === project.id || (session.projectId == null && session.taskId === mine.id)) {
              instants.push((session.endedAt ?? session.startedAt).getTime());
            }
          }
          if (finished) instants.push(finished.doneAt!.getTime());
          const expected = Math.max(0, keyDiff(intlDayKey(new Date(Math.max(...instants)), zone), todayKey));

          const row = summarizeWeek({ weekOf: todayKey, now, sessions, tasks, projects: [project, other], domains: [] })
            .projects.find((entry) => entry.projectId === project.id)!;
          expect(row.daysSinceTouched, `${zone} case ${i} now=${now.toISOString()}`).toBe(expected);
        }
      });
    });
  }
});
