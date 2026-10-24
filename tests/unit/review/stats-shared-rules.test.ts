/**
 * The weekly review and the planner must not disagree about what a day is, what
 * work on a project is, or how much of a rhythm a week has met. They share those
 * rules (planning/untouched.ts, planning/cadence.ts); these tests pin the review
 * to them from the review's side. d1's own stats tests are untouched.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/pacing/days';
import { cadenceDebt } from '@/lib/planning/cadence';
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
