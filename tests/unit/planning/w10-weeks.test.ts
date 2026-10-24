/**
 * Wave 10, simulated weeks (the roadmap's "done when").
 *
 * Instead of asserting hand-picked numbers, these tests LIVE through weeks day
 * by day - Monday-start local calendar weeks, in six zones, across the weeks
 * where the clocks change - and assert what must be true all the way through:
 *
 * 1. A project that keeps its own rhythm (with a day of jitter either way) is
 *    never called quiet.
 * 2. A project that stops is called quiet on EXACTLY its threshold day, counted
 *    in calendar days, even when a clock change makes that span 23 or 25 hours
 *    short or long.
 * 3. A user who follows the day's top two picks, working through TASKS exactly
 *    as the app's Start buttons record them, meets every project's weekly
 *    cadence once the planner has had a week to steer - and the planner stops
 *    favouring a project once it has had its week.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/pacing/days';
import { cadenceDebt, cadenceProgress, projectOfTaskIndex } from '@/lib/planning/cadence';
import { MAX_PICKS, MAX_PICKS_PER_PROJECT, rankPicks } from '@/lib/planning/rank-picks';
import { detectStalls, stallThresholdDays } from '@/lib/planning/stall';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import {
  DST_WEEK_MONDAYS,
  GUILT,
  ZONES,
  dayKeys,
  inZone,
  local,
  makeProject,
  makeSession,
  makeTask,
  seeded,
  weekdayOf,
  type Rng,
  type Zone,
} from './w10-helpers';

/** Weekdays (0 = Sunday) a project of this cadence works on, in a steady week. */
const RHYTHM: Record<number, readonly number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  5: [1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};
const CADENCES = [1, 2, 3, 5, 7] as const;

/** A time of day that keeps day-boundary bugs honest: late night and just after midnight too. */
function clockTime(random: Rng): [number, number] {
  const hour = random.pick([0, 0, 7, 12, 18, 23, 23] as const);
  return [hour, random.int(0, 59)];
}

/** The Monday that starts the simulation: two weeks before the DST week. */
const simStart = (zone: Zone, dstMonday: string) => addDays(dstMonday, -14);

describe('simulated weeks: a project keeping its rhythm is never quiet', () => {
  for (const zone of ZONES) {
    it(`holds in ${zone}, over the clock-change weeks, for every cadence`, () => {
      inZone(zone, () => {
        const random = seeded(0xa11ce ^ zone.length);
        for (const dstMonday of DST_WEEK_MONDAYS[zone]) {
          const start = simStart(zone, dstMonday);
          const days = dayKeys(start, 42); // six full Monday-start weeks
          for (const cadence of CADENCES) {
            for (const viaTask of [false, true]) {
              const project = makeProject({ cadencePerWeek: cadence, lastTouchedAt: local(start, 0, 0) });
              const task = makeTask({ projectId: project.id, status: 'done', doneAt: local(start, 0, 0) });

              const sessions: Session[] = [];
              for (const day of days) {
                if (!RHYTHM[cadence]!.includes(weekdayOf(day))) continue;
                const shifted = addDays(day, random.pick([-1, 0, 0, 1]));
                if (shifted < start) continue;
                const [hour, minute] = clockTime(random);
                sessions.push(
                  makeSession({
                    startedAt: local(shifted, hour, minute),
                    projectId: viaTask ? null : project.id,
                    taskId: viaTask ? task.id : null,
                  }),
                );
              }

              for (const day of days) {
                for (const [hour, minute] of [[0, 1], [8, 0], [23, 59]] as const) {
                  const at = local(day, hour, minute);
                  // Only what has happened by then: a future session must not hide a stall.
                  const happened = sessions.filter((s) => s.startedAt.getTime() <= at.getTime());
                  const stalls = detectStalls({ projects: [project], sessions: happened, tasks: [task], now: at });
                  expect(
                    stalls.map((s) => ({ day, hour, daysQuiet: s.daysQuiet, threshold: s.thresholdDays })),
                    `${zone} cadence ${cadence}${viaTask ? ' via task' : ''} ${day} ${hour}:${minute}`,
                  ).toEqual([]);
                }
              }
            }
          }
        }
      });
    });
  }
});

describe('simulated weeks: going quiet is flagged on exactly the threshold day', () => {
  const SETTINGS: { cadence: number | null; stallAfterDays: number | null }[] = [
    { cadence: 1, stallAfterDays: null }, // 14
    { cadence: 2, stallAfterDays: null }, // 8
    { cadence: 3, stallAfterDays: null }, // 7
    { cadence: null, stallAfterDays: null }, // 7
    { cadence: null, stallAfterDays: 3 },
    { cadence: 2, stallAfterDays: 10 },
    { cadence: null, stallAfterDays: 21 },
  ];

  for (const zone of ZONES) {
    it(`holds in ${zone}, with the clock change inside the quiet stretch`, () => {
      inZone(zone, () => {
        const random = seeded(0xbeef ^ zone.length);
        for (const dstMonday of DST_WEEK_MONDAYS[zone]) {
          const dstSunday = addDays(dstMonday, 6);
          for (const setting of SETTINGS) {
            const threshold = stallThresholdDays({ cadencePerWeek: setting.cadence, stallAfterDays: setting.stallAfterDays });
            // The last piece of work falls so that the clock change is inside the quiet stretch.
            const lastWorkDay = addDays(dstSunday, -Math.max(1, Math.floor(threshold / 2)));
            const [hour, minute] = clockTime(random);
            const project = makeProject({
              cadencePerWeek: setting.cadence,
              stallAfterDays: setting.stallAfterDays,
              lastTouchedAt: local(addDays(lastWorkDay, -30), 0, 0),
            });
            const sessions = [makeSession({ projectId: project.id, startedAt: local(lastWorkDay, hour, minute) })];

            const firstFlagged = addDays(lastWorkDay, threshold);
            for (const day of dayKeys(addDays(lastWorkDay, -2), threshold + 8)) {
              for (const [h, m] of [[0, 1], [8, 0], [23, 59]] as const) {
                const at = local(day, h, m);
                const happened = sessions.filter((s) => s.startedAt.getTime() <= at.getTime());
                const flagged = detectStalls({ projects: [project], sessions: happened, tasks: [], now: at }).length === 1;
                const label = `${zone} cadence=${setting.cadence} stallAfter=${setting.stallAfterDays} (T=${threshold}) lastWork=${lastWorkDay} ${hour}:${minute} check ${day} ${h}:${m}`;
                // Before the project's last piece of work it was still being worked (not modelled); only the quiet stretch is asserted.
                if (at.getTime() < sessions[0]!.startedAt.getTime()) continue;
                expect(flagged, label).toBe(day >= firstFlagged);
              }
            }
          }
        }
      });
    });
  }
});

describe('simulated weeks: cadence debt steers the daily picks', () => {
  const WARM_UP_DAYS = 8;
  const DAYS = 42;

  interface Simulation {
    readonly sessions: Session[];
    readonly tasks: Task[];
    readonly dayLog: {
      day: string;
      pickProjects: (string | null)[];
      reasons: string[][];
      debtBefore: Record<string, number>;
      debtAfter: Record<string, number>;
    }[];
    readonly projects: ReturnType<typeof makeProject>[];
  }

  function simulate(mondayKey: string): Simulation {
    const novel = makeProject({ title: 'Novel', cadencePerWeek: 3, lastTouchedAt: local(mondayKey, 0, 0) });
    const course = makeProject({ title: 'Course', cadencePerWeek: 2, cadenceBlockMin: 45, lastTouchedAt: local(mondayKey, 0, 0) });
    const garden = makeProject({ title: 'Garden', lastTouchedAt: local(mondayKey, 0, 0) });
    const projects = [novel, course, garden];

    let created = 0;
    const spawn = (projectId: string | null, estimateMin: number): Task => {
      created += 1;
      return makeTask({
        projectId,
        estimateMin,
        createdAt: new Date(Date.UTC(2026, 0, 1) + created * 1000),
        touchedAt: new Date(Date.UTC(2026, 0, 1) + created * 1000),
      });
    };
    const tasks: Task[] = [];
    for (let i = 0; i < 4; i += 1) {
      tasks.push(spawn(novel.id, 25), spawn(course.id, 45), spawn(garden.id, 25));
    }
    for (let i = 0; i < 3; i += 1) tasks.push(spawn(null, 25));

    const sessions: Session[] = [];
    const dayLog: Simulation['dayLog'] = [];
    const debts = (at: Date) =>
      Object.fromEntries(projects.map((p) => [p.id, cadenceDebt(p, sessions, at, tasks)] as const));

    for (const day of dayKeys(mondayKey, DAYS)) {
      const morning = local(day, 8, 0);
      const picks = rankPicks({
        tasks,
        projects,
        recentSessions: sessions,
        domainTime: {},
        capacity: { capacityMin: 630 },
        now: morning,
      });
      const debtBefore = debts(morning);

      // The user does the day's top two picks, each as a session on the TASK.
      picks.slice(0, 2).forEach((pick, index) => {
        sessions.push(
          makeSession({
            startedAt: local(day, 9 + index * 3, 0),
            durationMinutes: pick.task.estimateMin ?? 25,
            taskId: pick.task.id,
            projectId: null,
          }),
        );
        const at = tasks.findIndex((t) => t.id === pick.task.id);
        tasks[at] = { ...pick.task, status: 'done', doneAt: local(day, 10 + index * 3, 0), touchedAt: local(day, 10 + index * 3, 0) };
        tasks.push(spawn(pick.task.projectId ?? null, pick.task.estimateMin ?? 25));
      });

      dayLog.push({
        day,
        pickProjects: picks.map((pick) => pick.task.projectId ?? null),
        reasons: picks.map((pick) => pick.reasons),
        debtBefore,
        debtAfter: debts(local(day, 23, 59)),
      });
    }
    return { sessions, tasks, dayLog, projects };
  }

  for (const zone of ZONES) {
    it(`meets every weekly cadence and then stops favouring the project in ${zone}`, () => {
      inZone(zone, () => {
        for (const dstMonday of DST_WEEK_MONDAYS[zone]) {
          const mondayKey = simStart(zone, dstMonday);
          const sim = simulate(mondayKey);
          const [novel, course] = sim.projects as [ReturnType<typeof makeProject>, ReturnType<typeof makeProject>, unknown];
          const projectOfTask = projectOfTaskIndex(sim.tasks);
          const label = (day: string) => `${zone} week of ${mondayKey}, ${day}`;

          sim.dayLog.forEach((entry, index) => {
            // The planner never fills the day with one project while others are available.
            const counts = new Map<string | null, number>();
            for (const projectId of entry.pickProjects) counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
            expect(entry.pickProjects.length, label(entry.day)).toBeLessThanOrEqual(MAX_PICKS);
            for (const count of counts.values()) expect(count, label(entry.day)).toBeLessThanOrEqual(MAX_PICKS_PER_PROJECT);

            // Wording stays calm.
            for (const reason of entry.reasons.flat()) expect(reason, label(entry.day)).not.toMatch(GUILT);

            // A cadence reason is given exactly to the projects that still want a block this morning.
            entry.pickProjects.forEach((projectId, pickIndex) => {
              const hasCadenceReason = entry.reasons[pickIndex]!.some((reason) => / wants \d+ /.test(reason));
              const wantsMore = projectId !== null && (entry.debtBefore[projectId] ?? 0) > 0;
              expect(hasCadenceReason, `${label(entry.day)} pick ${pickIndex}`).toBe(wantsMore);
            });

            // After a week of steering, nobody ends the day still wanting a block.
            if (index >= WARM_UP_DAYS) {
              expect(entry.debtAfter[novel.id], `${label(entry.day)} Novel debt`).toBe(0);
              expect(entry.debtAfter[course.id], `${label(entry.day)} Course debt`).toBe(0);
            }
          });

          // Every full Monday-Sunday week after the warm-up has the sessions it asked for.
          for (let weekStart = 14; weekStart + 7 <= DAYS; weekStart += 7) {
            const week = new Set(dayKeys(addDays(mondayKey, weekStart), 7));
            const inWeek = sim.sessions.filter((s) => week.has(dayKeyOf(s.startedAt)));
            const forProject = (id: string) =>
              inWeek.filter((s) => (s.taskId ? projectOfTask.get(s.taskId) : s.projectId) === id);
            expect(forProject(novel.id).length, `${zone} ${mondayKey} week +${weekStart} Novel sessions`).toBeGreaterThanOrEqual(3);
            const courseMinutes = forProject(course.id).reduce((sum, s) => sum + Math.min(s.durationMinutes ?? 45, 45), 0);
            expect(courseMinutes, `${zone} ${mondayKey} week +${weekStart} Course minutes`).toBeGreaterThanOrEqual(90);
          }

          // The reason sentence reports the minutes for the minutes-based project.
          const progress = cadenceProgress(course, sim.sessions, local(addDays(mondayKey, 20), 8, 0), projectOfTask);
          expect(progress.blockMin).toBe(45);
        }
      });
    });
  }
});

function dayKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
