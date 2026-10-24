/**
 * Cadence (roadmap Wave 10): the rhythm a project asks for, and how much of it
 * the last seven local days have met.
 *
 * "Cadence debt" is the number of blocks a project still wants this week. It
 * is a quiet nudge that moves the project's tasks up the daily picks (see
 * `rank-picks.ts`), never a count of things missed, and it has two shapes:
 *
 * - **By sessions** (`cadencePerWeek` only): every session in the window is one
 *   block. This is the original rule and nothing about it changed.
 * - **By minutes** (`cadencePerWeek` and `cadenceBlockMin`, "2 blocks a week,
 *   45 min"): a session earns the share of a block that its minutes cover, and
 *   one session never earns more than one block. A 10-minute touch counts for
 *   a little, a 45-minute session for a whole block, and a three-hour push for
 *   the same one block - the point of the wave is rhythm, not heroics.
 *
 * The window is the last seven LOCAL days with today included, the same as the
 * planner has always used. It is a calendar window, so a DST change cannot
 * drop or add a session at its edge.
 */

import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import { addDays } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';

/** How many local days (today included) one cadence week looks back. */
export const CADENCE_WINDOW_DAYS = 7;

/**
 * Float noise in summed minutes (22.5 + 22.5 is exact, 10.2 + 10.1 + 24.7 is
 * not) must not turn "exactly met" into "a sliver short", so a remainder this
 * small, in blocks, is treated as met.
 */
const BLOCK_EPSILON = 1e-9;

/** Local day keys of the cadence window: today and the six days before it. */
export function cadenceWindowKeys(now: Date): Set<string> {
  const todayKey = toLocalDateString(now);
  const keys = new Set<string>();
  for (let offset = 0; offset < CADENCE_WINDOW_DAYS; offset += 1) keys.add(addDays(todayKey, -offset));
  return keys;
}

/** The tasks' project links, as a lookup from task id to project id. */
export function projectOfTaskIndex(
  tasks: readonly Pick<Task, 'id' | 'projectId'>[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const task of tasks) {
    if (task.projectId) index.set(task.id, task.projectId);
  }
  return index;
}

/**
 * The project a session was spent on.
 *
 * A session names its project directly only when the user picked the project
 * itself. Every Start button in the app links a TASK, so most work on a
 * project is recorded as a task session; it belongs to the task's project. An
 * explicit `projectId` wins over the task's project.
 */
export function sessionProjectId(
  session: Pick<Session, 'projectId' | 'taskId'>,
  projectOfTask?: ReadonlyMap<string, string>,
): string | null {
  if (session.projectId) return session.projectId;
  if (session.taskId && projectOfTask) return projectOfTask.get(session.taskId) ?? null;
  return null;
}

export interface CadenceProgress {
  /** Blocks per week the project asks for (0 when it has no target). */
  readonly wanted: number;
  /** Target minutes per block, when the project counts by minutes. */
  readonly blockMin: number | null;
  /** Sessions in the window. */
  readonly sessions: number;
  /** Minutes in the window, from timed sessions. */
  readonly minutes: number;
  /** Whole blocks still wanted, 0 to `wanted`. */
  readonly debt: number;
}

const NO_CADENCE: CadenceProgress = { wanted: 0, blockMin: null, sessions: 0, minutes: 0, debt: 0 };

/**
 * How the last seven local days measure against the project's rhythm.
 *
 * `projectOfTask` lets sessions linked to one of the project's tasks count;
 * without it only sessions that name the project do.
 */
export function cadenceProgress(
  project: Pick<Project, 'id' | 'cadencePerWeek' | 'cadenceBlockMin'>,
  sessions: readonly Session[],
  now: Date,
  projectOfTask?: ReadonlyMap<string, string>,
): CadenceProgress {
  const wanted = project.cadencePerWeek ?? 0;
  if (wanted <= 0) return NO_CADENCE;

  const days = cadenceWindowKeys(now);
  const mine = sessions.filter(
    (session) =>
      sessionProjectId(session, projectOfTask) === project.id &&
      days.has(toLocalDateString(session.startedAt)),
  );
  const minutes = mine.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);

  const blockMin = project.cadenceBlockMin ?? null;
  if (blockMin === null) {
    return { wanted, blockMin, sessions: mine.length, minutes, debt: Math.max(0, wanted - mine.length) };
  }

  // A session without minutes (reps only) cannot be measured; it counts as a
  // whole block, as it always has.
  const credited = mine.reduce(
    (sum, session) => sum + Math.min(session.durationMinutes ?? blockMin, blockMin),
    0,
  );
  const remainingBlocks = (wanted * blockMin - credited) / blockMin;
  const debt = Math.min(wanted, Math.max(0, Math.ceil(remainingBlocks - BLOCK_EPSILON)));
  return { wanted, blockMin, sessions: mine.length, minutes, debt };
}

/**
 * How many blocks a project still wants this week.
 *
 * Pass `tasks` so sessions spent on the project's tasks count; the planner and
 * the weekly review both do.
 */
export function cadenceDebt(
  project: Pick<Project, 'id' | 'cadencePerWeek' | 'cadenceBlockMin'>,
  sessions: readonly Session[],
  now: Date,
  tasks?: readonly Pick<Task, 'id' | 'projectId'>[],
): number {
  return cadenceProgress(project, sessions, now, tasks ? projectOfTaskIndex(tasks) : undefined).debt;
}
