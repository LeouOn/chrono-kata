import { z } from 'zod';
import { addDays, daysBetweenDayKeys } from '@/lib/pacing/days';
import { cadenceDebt, projectOfTaskIndex, sessionProjectId } from '@/lib/planning/cadence';
import { WAITING_AFTER_DAYS, isUntouchedFor } from '@/lib/planning/untouched';
import { localWallClockToEpoch } from '@/lib/planning/time';
import { toLocalDateString } from '@/lib/utils/date';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';
import type { Domain } from '@/lib/schemas/domain';
import { WeekKeySchema, mondayOf, weekRange } from './week';

/**
 * Pure, deterministic numbers for one review week (roadmap Wave 11).
 *
 * No UI, no Dexie, no clock reads: `now` is an input. The result is validated
 * against `WeeklyStatsSchema`, so the shape stored in `Review.statsSnapshot`
 * and the shape this function builds cannot drift apart.
 *
 * "Untouched for N local days" is the shared W10/W11 definition of a task that
 * is **waiting** (never "stale", never "overdue"). It lives in
 * `planning/untouched.ts`, so project stall detection and the review cannot
 * disagree.
 *
 * Sessions are attributed to a project through their own `projectId` first and
 * through their task's `projectId` second (`sessionProjectId`), because the
 * "Working on" picker is exclusive: work on a project's task carries no
 * project id of its own.
 */
/** Kept as an alias of the shared rule so existing importers keep working. */
export const WAITING_DAYS = WAITING_AFTER_DAYS;

/** Minutes per domain for the week, optionally against a stated intention. */
export const DomainBalanceRowSchema = z.object({
  domainId: z.string().uuid(),
  minutes: z.number().finite().nonnegative(),
  /** Stated intention in minutes for the week, or null when none was given. */
  intended: z.number().int().nonnegative().nullable(),
  delta: z.number().finite().nullable(),
});

/** Estimated vs actual minutes for the tasks that saw work this week. */
export const EstimateVsActualSchema = z.object({
  estimatedMin: z.number().int().nonnegative(),
  actualMin: z.number().finite().nonnegative(),
  deltaMin: z.number().finite(),
  tasks: z.number().int().nonnegative(),
  tasksWithoutEstimate: z.number().int().nonnegative(),
});

/** Per-project week: how much it moved, and what its rhythm still wants. */
export const ProjectWeekSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(['active', 'paused']),
  sessionsThisWeek: z.number().int().nonnegative(),
  cadenceDebt: z.number().int().nonnegative(),
  daysSinceTouched: z.number().int().nonnegative(),
});

export const WeekSessionsSchema = z.object({
  total: z.number().int().nonnegative(),
  /** Sessions that ended `done` or `progress`. */
  moved: z.number().int().nonnegative(),
  /** Sessions that ended `blocked` — information, not a failure count. */
  stalled: z.number().int().nonnegative(),
  /** Practice sessions and old rows with no outcome. */
  withoutOutcome: z.number().int().nonnegative(),
  minutes: z.number().finite().nonnegative(),
});

export const WeeklyStatsSchema = z.object({
  weekOf: WeekKeySchema,
  weekStart: z.number().int(),
  weekEnd: z.number().int(),
  domainBalance: z.array(DomainBalanceRowSchema),
  estimateVsActual: EstimateVsActualSchema,
  /** `next` tasks waiting on a decision from the user. */
  waitingTaskIds: z.array(z.string().uuid()),
  projects: z.array(ProjectWeekSchema),
  sessions: WeekSessionsSchema,
  /** Minutes that could not be attributed to a known domain. */
  unassignedMinutes: z.number().finite().nonnegative(),
});
export type WeeklyStats = z.infer<typeof WeeklyStatsSchema>;

export interface WeeklyStatsInput {
  /** Any day key inside the week; normalised to that week's Monday. */
  weekOf: string;
  sessions: readonly Session[];
  tasks: readonly Task[];
  projects: readonly Project[];
  domains: readonly Domain[];
  /** Stated intentions for this week, as minutes per domain id. */
  intentions?: Readonly<Record<string, number>>;
  /** The instant the review is being taken; drives "waiting" and cadence. */
  now: Date;
}

/**
 * Sessions count toward the week in which they *started*, in the local
 * calendar. Boundaries are instants from `weekRange`, so a DST week keeps its
 * real 167/169 hours and a half-hour zone still gets two local midnights.
 */
export function summarizeWeek(input: WeeklyStatsInput): WeeklyStats {
  const weekOf = mondayOf(input.weekOf);
  const { start, end } = weekRange(weekOf);

  const inWeek = input.sessions.filter((session) => {
    const at = session.startedAt.getTime();
    return at >= start && at < end;
  });

  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const projectById = new Map(input.projects.map((project) => [project.id, project] as const));
  const knownDomain = new Set(input.domains.map((domain) => domain.id));
  // The "Working on" picker is exclusive and every Start button links a task
  // only, so work on a project's task carries no `projectId` of its own: it is
  // attributed through the task (`sessionProjectId`), here and in cadence debt.
  const projectOfTask = projectOfTaskIndex(input.tasks);

  // The most specific link wins: the task's domain, then the session's project,
  // then the task's own project.
  const domainForSession = (session: Session): string | null => {
    const task = session.taskId ? taskById.get(session.taskId) : undefined;
    const projectId = sessionProjectId(session, projectOfTask);
    const project = projectId ? projectById.get(projectId) : undefined;
    return task?.domainId ?? project?.domainId ?? null;
  };

  const domainMinutes = new Map<string, number>(input.domains.map((domain) => [domain.id, 0]));
  let unassignedMinutes = 0;
  let weekMinutes = 0;
  for (const session of inWeek) {
    const minutes = session.durationMinutes ?? 0;
    weekMinutes += minutes;
    const domainId = domainForSession(session);
    if (domainId && knownDomain.has(domainId)) {
      domainMinutes.set(domainId, (domainMinutes.get(domainId) ?? 0) + minutes);
    } else {
      unassignedMinutes += minutes;
    }
  }

  // Every domain appears, including ones with no time this week: a review that
  // silently omitted an untouched area could not show the imbalance.
  const orderedDomains = [...input.domains].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
  const domainBalance = orderedDomains.map((domain) => {
    const minutes = domainMinutes.get(domain.id) ?? 0;
    const intended = input.intentions?.[domain.id] ?? null;
    return {
      domainId: domain.id,
      minutes,
      intended,
      delta: intended == null ? null : minutes - intended,
    };
  });

  // Estimate vs actual is scoped to this week, from the session rows. The
  // lifetime cache `Task.actualMin` spans all history, so using it here would
  // compare last month's work against this week's intentions.
  const weekMinutesByTask = new Map<string, number>();
  for (const session of inWeek) {
    const minutes = session.durationMinutes ?? 0;
    if (!session.taskId || minutes <= 0) continue;
    weekMinutesByTask.set(session.taskId, (weekMinutesByTask.get(session.taskId) ?? 0) + minutes);
  }
  let estimatedMin = 0;
  let actualMin = 0;
  let measuredTasks = 0;
  let tasksWithoutEstimate = 0;
  for (const taskId of [...weekMinutesByTask.keys()].sort()) {
    const task = taskById.get(taskId);
    if (!task) continue;
    measuredTasks += 1;
    actualMin += weekMinutesByTask.get(taskId) ?? 0;
    if (task.estimateMin == null) tasksWithoutEstimate += 1;
    else estimatedMin += task.estimateMin;
  }

  // Waiting: a `next` task untouched for WAITING_AFTER_DAYS local days (the
  // shared rule in planning/untouched.ts: local days, not elapsed milliseconds,
  // so it is the same on a DST week). A task deliberately deferred into the
  // future is not waiting for a decision.
  const todayKey = toLocalDateString(input.now);
  const nowMs = input.now.getTime();
  const waitingTaskIds = input.tasks
    .filter((task) => task.status === 'next')
    .filter((task) => !task.deferUntil || task.deferUntil.getTime() <= nowMs)
    .filter((task) => isUntouchedFor(task.touchedAt, input.now, WAITING_AFTER_DAYS))
    .map((task) => task.id)
    .sort();

  // Cadence is measured over the reviewed week itself, not the seven days
  // before "now", so re-running the same week later reports the same debt.
  const cadenceAsOf = new Date(localWallClockToEpoch(addDays(weekOf, 6), '12:00'));
  const sessionsByProject = new Map<string, number>();
  for (const session of inWeek) {
    const projectId = sessionProjectId(session, projectOfTask);
    if (!projectId) continue;
    sessionsByProject.set(projectId, (sessionsByProject.get(projectId) ?? 0) + 1);
  }
  const weekProjects = input.projects
    .filter((project): project is Project & { status: 'active' | 'paused' } =>
      project.status === 'active' || project.status === 'paused',
    )
    .map((project) => ({
      projectId: project.id,
      status: project.status,
      sessionsThisWeek: sessionsByProject.get(project.id) ?? 0,
      cadenceDebt:
        project.status === 'active' ? cadenceDebt(project, input.sessions, cadenceAsOf, input.tasks) : 0,
      daysSinceTouched: Math.max(
        0,
        daysBetweenDayKeys(toLocalDateString(project.lastTouchedAt), todayKey),
      ),
    }))
    // Most recently touched first (a review reads top-down), then id so the
    // order never depends on the database's insertion order.
    .sort((a, b) => a.daysSinceTouched - b.daysSinceTouched || a.projectId.localeCompare(b.projectId));

  return WeeklyStatsSchema.parse({
    weekOf,
    weekStart: start,
    weekEnd: end,
    domainBalance,
    estimateVsActual: {
      estimatedMin,
      actualMin,
      deltaMin: actualMin - estimatedMin,
      tasks: measuredTasks,
      tasksWithoutEstimate,
    },
    waitingTaskIds,
    projects: weekProjects,
    sessions: {
      total: inWeek.length,
      moved: inWeek.filter(
        (session) => session.outcome === 'done' || session.outcome === 'progress',
      ).length,
      stalled: inWeek.filter((session) => session.outcome === 'blocked').length,
      withoutOutcome: inWeek.filter((session) => session.outcome == null).length,
      minutes: weekMinutes,
    },
    unassignedMinutes,
  });
}
