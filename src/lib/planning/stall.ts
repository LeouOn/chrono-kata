/**
 * Stall detection (roadmap Wave 10): which active projects have gone quiet
 * long enough to deserve a gentle offer.
 *
 * A stall is DERIVED, never stored. Nothing changes a project's status when it
 * goes quiet - an unpicked project rests on the list without guilt - and
 * nothing here ever says anything is late, overdue or missed. The result is a
 * list the revive card can read from; it is the card's job to be soft, and the
 * offer is always the same small one: a ten-minute session that leaves a
 * breadcrumb (`MINIMUM_SESSION_MIN`).
 *
 * When is a project stalled?
 *
 * - Only an `active` project can be. Paused, done and dropped ones are resting
 *   on purpose.
 * - It has had no WORK for the threshold number of local days (see
 *   `untouched.ts`). Work is a session on the project or on one of its tasks,
 *   a task of the project finished, or the project's own `lastTouchedAt`.
 *   Reading, sorting or re-planning a task is not work: the weekly review
 *   touches tasks, and that must not hide a project that went quiet.
 * - The threshold is the project's own `stallAfterDays`, or else twice its
 *   usual gap (a project that wants 1 a week is quiet at 14 days, one that
 *   wants 2 a week at 8), and never sooner than a week. A project that is
 *   keeping its own rhythm is therefore never flagged.
 *
 * The list is ordered most recently quiet first: the project that slipped last
 * is the easiest to pick back up, and the card shows one at a time.
 */

import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import { CADENCE_WINDOW_DAYS, projectOfTaskIndex, sessionProjectId } from './cadence';
import { daysUntouched } from './untouched';

/** The only thing a revive offers: a session this long, to touch the project. */
export const MINIMUM_SESSION_MIN = 10;

/** A project with no rhythm of its own is quiet after this many days. */
export const DEFAULT_STALL_DAYS = 7;

/** How many days a project wants between touches, from its weekly target. */
function usualGapDays(cadencePerWeek: number | null | undefined): number | null {
  if (!cadencePerWeek || cadencePerWeek <= 0) return null;
  return Math.ceil(CADENCE_WINDOW_DAYS / cadencePerWeek);
}

/** Days without work after which this project counts as quiet. */
export function stallThresholdDays(
  project: Pick<Project, 'stallAfterDays' | 'cadencePerWeek'>,
  defaultDays: number = DEFAULT_STALL_DAYS,
): number {
  if (project.stallAfterDays != null) return project.stallAfterDays;
  const gap = usualGapDays(project.cadencePerWeek);
  return gap === null ? defaultDays : Math.max(defaultDays, gap * 2);
}

/**
 * The last time each project had real work, by project id.
 *
 * Every project gets an entry (its own `lastTouchedAt` at least); later work
 * moves it forward. A session's moment is when it ended, or when it started.
 */
export function lastWorkByProject(
  projects: readonly Pick<Project, 'id' | 'lastTouchedAt'>[],
  sessions: readonly Pick<Session, 'projectId' | 'taskId' | 'startedAt' | 'endedAt'>[],
  tasks: readonly Pick<Task, 'id' | 'projectId' | 'status' | 'doneAt'>[],
): Map<string, Date> {
  const last = new Map<string, Date>();
  const note = (projectId: string, at: Date | null | undefined) => {
    if (!at || !Number.isFinite(at.getTime())) return;
    const known = last.get(projectId);
    if (!known || at.getTime() > known.getTime()) last.set(projectId, at);
  };

  for (const project of projects) note(project.id, project.lastTouchedAt);

  const projectOfTask = projectOfTaskIndex(tasks);
  for (const session of sessions) {
    const projectId = sessionProjectId(session, projectOfTask);
    if (projectId) note(projectId, session.endedAt ?? session.startedAt);
  }
  for (const task of tasks) {
    if (task.projectId && task.status === 'done') note(task.projectId, task.doneAt);
  }
  return last;
}

export interface ProjectStall {
  readonly project: Project;
  /** When the project last had work. */
  readonly lastWorkAt: Date;
  /** Whole local days since then. */
  readonly daysQuiet: number;
  /** The threshold it passed. */
  readonly thresholdDays: number;
}

export interface DetectStallsInput {
  readonly projects: readonly Project[];
  readonly sessions: readonly Session[];
  readonly tasks: readonly Task[];
  readonly now: Date;
  /** The threshold for a project with no rhythm and no setting of its own. */
  readonly defaultDays?: number;
}

/**
 * The active projects that have gone quiet, most recently quiet first (ties by
 * id, so the same input always gives the same list).
 */
export function detectStalls(input: DetectStallsInput): ProjectStall[] {
  const { now, defaultDays = DEFAULT_STALL_DAYS } = input;
  const lastWork = lastWorkByProject(input.projects, input.sessions, input.tasks);

  const stalls: ProjectStall[] = [];
  for (const project of input.projects) {
    if (project.status !== 'active') continue;
    const lastWorkAt = lastWork.get(project.id) ?? project.lastTouchedAt;
    const daysQuiet = daysUntouched(lastWorkAt, now);
    const thresholdDays = stallThresholdDays(project, defaultDays);
    if (daysQuiet >= thresholdDays) stalls.push({ project, lastWorkAt, daysQuiet, thresholdDays });
  }

  return stalls.sort((a, b) => {
    if (a.daysQuiet !== b.daysQuiet) return a.daysQuiet - b.daysQuiet;
    return a.project.id < b.project.id ? -1 : a.project.id > b.project.id ? 1 : 0;
  });
}
