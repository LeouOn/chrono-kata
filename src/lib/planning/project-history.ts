/**
 * What the project page shows (roadmap Wave 10, part 2), as pure functions.
 *
 * Everything here is derived, never stored: a project's sessions, the time put
 * into it, its timeline of "pick up here" notes, and what is next. Nothing
 * writes, and nothing says anything is late, overdue, behind or missed - a
 * project that has been quiet is just said to have last been worked on a while
 * ago.
 *
 * A session belongs to a project through its own `projectId` or, far more
 * often, through its task (every Start button links a task): see
 * `sessionProjectId`. The same attribution feeds cadence and stall detection,
 * so the page cannot disagree with the daily picks or the weekly review.
 */

import type { Project } from '@/lib/schemas/project';
import type { Session, SessionOutcome } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import { sumSessionMinutes } from '@/lib/sessions/outcome';
import { toLocalDateString } from '@/lib/utils/date';
import {
  cadenceProgress,
  cadenceWindowKeys,
  projectOfTaskIndex,
  sessionProjectId,
  type CadenceProgress,
} from './cadence';
import { lastWorkByProject } from './stall';
import { daysUntouched } from './untouched';

type SessionLike = Pick<
  Session,
  'id' | 'projectId' | 'taskId' | 'startedAt' | 'durationMinutes' | 'reps' | 'outcome' | 'breadcrumb'
>;

/** The sessions that belong to a project, newest first (ties by id). */
export function projectSessions<S extends Pick<Session, 'id' | 'projectId' | 'taskId' | 'startedAt'>>(
  projectId: string,
  sessions: readonly S[],
  tasks: readonly Pick<Task, 'id' | 'projectId'>[],
): S[] {
  const projectOfTask = projectOfTaskIndex(tasks);
  return sessions
    .filter((session) => sessionProjectId(session, projectOfTask) === projectId)
    .sort((a, b) => {
      const byTime = b.startedAt.getTime() - a.startedAt.getTime();
      if (byTime !== 0) return byTime;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export interface TimeInvested {
  /** Sessions on the project, all time. */
  readonly sessions: number;
  /** Minutes from timed sessions, all time (a reps-only session has none). */
  readonly minutes: number;
  /** Sessions and minutes in the last seven local days, today included. */
  readonly thisWeekSessions: number;
  readonly thisWeekMinutes: number;
  readonly firstAt: Date | null;
  readonly lastAt: Date | null;
}

/** Time put into a project. `sessionsOfProject` is what `projectSessions` returns. */
export function timeInvested(
  sessionsOfProject: readonly Pick<Session, 'startedAt' | 'durationMinutes'>[],
  now: Date,
): TimeInvested {
  const week = cadenceWindowKeys(now);
  const thisWeek = sessionsOfProject.filter((session) => week.has(toLocalDateString(session.startedAt)));
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;
  for (const session of sessionsOfProject) {
    if (firstAt === null || session.startedAt.getTime() < firstAt.getTime()) firstAt = session.startedAt;
    if (lastAt === null || session.startedAt.getTime() > lastAt.getTime()) lastAt = session.startedAt;
  }
  return {
    sessions: sessionsOfProject.length,
    minutes: sumSessionMinutes(sessionsOfProject),
    thisWeekSessions: thisWeek.length,
    thisWeekMinutes: sumSessionMinutes(thisWeek),
    firstAt,
    lastAt,
  };
}

export interface TimelineEntry {
  readonly sessionId: string;
  readonly at: Date;
  /** The local day of `at`, e.g. "2026-06-17". */
  readonly dayKey: string;
  readonly minutes: number | null;
  readonly reps: number | null;
  readonly outcome: SessionOutcome | null;
  /** The "pick up here next time" note left at the end of the session, if any. */
  readonly breadcrumb: string | null;
  readonly taskId: string | null;
}

export interface TimelineDay {
  readonly dayKey: string;
  readonly entries: TimelineEntry[];
}

/**
 * The project's history, newest day first and newest session first within a
 * day, grouped by LOCAL day. A session that has no note is still in the
 * timeline: the page is both "sessions" and "breadcrumb history".
 */
export function projectTimeline(sessionsOfProject: readonly SessionLike[]): TimelineDay[] {
  const ordered = [...sessionsOfProject].sort((a, b) => {
    const byTime = b.startedAt.getTime() - a.startedAt.getTime();
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const days: TimelineDay[] = [];
  for (const session of ordered) {
    const dayKey = toLocalDateString(session.startedAt);
    const note = typeof session.breadcrumb === 'string' ? session.breadcrumb.trim() : '';
    const entry: TimelineEntry = {
      sessionId: session.id,
      at: session.startedAt,
      dayKey,
      minutes: session.durationMinutes ?? null,
      reps: session.reps ?? null,
      outcome: session.outcome ?? null,
      breadcrumb: note === '' ? null : note,
      taskId: session.taskId ?? null,
    };
    const last = days[days.length - 1];
    if (last && last.dayKey === dayKey) last.entries.push(entry);
    else days.push({ dayKey, entries: [entry] });
  }
  return days;
}

/** How many tasks "what is next" lists. */
export const NEXT_TASKS_SHOWN = 3;

/**
 * Is this a task to do next, right now? One definition, used by the page's list
 * and the list row's count so they cannot disagree: status `next`, and not
 * deferred to a later time.
 */
export function isNextNow(task: Pick<Task, 'status' | 'deferUntil'>, now: Date): boolean {
  if (task.status !== 'next') return false;
  return !task.deferUntil || task.deferUntil.getTime() <= now.getTime();
}

export interface SessionNote {
  readonly at: Date;
  readonly text: string;
}

/** The newest "pick up here" note in a timeline (newest first), or null. */
export function latestSessionNote(timeline: readonly TimelineDay[]): SessionNote | null {
  for (const day of timeline) {
    for (const entry of day.entries) {
      if (entry.breadcrumb) return { at: entry.at, text: entry.breadcrumb };
    }
  }
  return null;
}

export interface NextAction {
  /** The newest "after this, do X" note: the project's own, or the latest session's. */
  readonly breadcrumb: string | null;
  /** Its `next` tasks that are not deferred, most recently touched first. */
  readonly nextTasks: Task[];
}

/**
 * What to do next on a project: its newest note, and a few of its next tasks.
 *
 * A session on the project itself writes its note to the project too, but a
 * session on one of its TASKS (nearly all of them) only writes it to the task,
 * so the project's own `breadcrumb` is often empty or behind. The note shown is
 * therefore the newer of the two: the latest session note if that session
 * started after the project's note last CHANGED (`breadcrumbAt`, stamped by the
 * repository only when the text changes), otherwise the project's own (a note
 * typed in the weekly review is newer than the sessions before it).
 *
 * `updatedAt` is NOT the note's time: it moves on every write to the row
 * (pausing, a cadence edit), which would make an old note look new. It is used
 * only as the fallback for a row written before `breadcrumbAt` existed, and such
 * a row keeps that old behaviour until its note is next written.
 */
export function projectNextAction(
  project: Pick<Project, 'id' | 'breadcrumb' | 'breadcrumbAt' | 'updatedAt'>,
  tasks: readonly Task[],
  now: Date,
  options: { readonly limit?: number; readonly sessionNote?: SessionNote | null } = {},
): NextAction {
  const limit = options.limit ?? NEXT_TASKS_SHOWN;
  const own = typeof project.breadcrumb === 'string' ? project.breadcrumb.trim() : '';
  const fromSession = options.sessionNote ?? null;
  const ownAt = project.breadcrumbAt ?? project.updatedAt;
  const note =
    own !== '' && fromSession !== null
      ? fromSession.at.getTime() > ownAt.getTime()
        ? fromSession.text
        : own
      : own !== ''
        ? own
        : (fromSession?.text ?? '');
  const nextTasks = tasks
    .filter((task) => task.projectId === project.id && isNextNow(task, now))
    .sort((a, b) => {
      const byTouch = b.touchedAt.getTime() - a.touchedAt.getTime();
      if (byTouch !== 0) return byTouch;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
  return { breadcrumb: note === '' ? null : note, nextTasks };
}

/** When a project was last worked on, for a number of whole local days, in calm words. */
export function workedAgo(days: number): string {
  const d = Math.max(0, Math.floor(days));
  if (d === 0) return 'Worked today';
  if (d === 1) return 'Last worked yesterday';
  if (d < 7) return `Last worked ${d} days ago`;
  if (d < 60) {
    const weeks = Math.floor(d / 7);
    return weeks === 1 ? 'Last worked a week ago' : `Last worked ${weeks} weeks ago`;
  }
  const months = Math.floor(d / 30);
  return `Last worked ${months} months ago`;
}

export interface RhythmLines {
  /** The project's target, e.g. "2 a week, 45 min each"; null without one. */
  readonly target: string | null;
  /** How this week stands, e.g. "This week: 20 of 90 min"; null without a target. */
  readonly week: string | null;
}

/** The rhythm in words. Neutral: "kept" or "n of m", never a count of what was missed. */
export function rhythmLines(
  project: Pick<Project, 'cadencePerWeek' | 'cadenceBlockMin'>,
  progress: CadenceProgress,
): RhythmLines {
  const wanted = project.cadencePerWeek ?? 0;
  if (wanted <= 0) return { target: null, week: null };
  const block = project.cadenceBlockMin ?? null;
  const target = block === null ? `${wanted} a week` : `${wanted} a week, ${block} min each`;
  if (progress.debt === 0) return { target, week: 'This week: kept' };
  if (block === null) return { target, week: `This week: ${wanted - progress.debt} of ${wanted}` };
  return { target, week: `This week: ${Math.round(progress.minutes)} of ${wanted * block} min` };
}

export interface ProjectSummary {
  readonly project: Project;
  /** Whole local days since the project last had work (session, finished task, lastTouchedAt). */
  readonly daysQuiet: number;
  readonly progress: CadenceProgress;
  readonly nextCount: number;
}

/**
 * The rows of the project list: active projects first, then paused ones; within
 * each, the most recently worked on first (ties by title, then id). Finished and
 * let-go projects are left off the list; they rest, and their page still opens.
 */
export function projectSummaries(input: {
  readonly projects: readonly Project[];
  readonly sessions: readonly Session[];
  readonly tasks: readonly Task[];
  readonly now: Date;
}): ProjectSummary[] {
  const { now } = input;
  const lastWork = lastWorkByProject(input.projects, input.sessions, input.tasks);
  const projectOfTask = projectOfTaskIndex(input.tasks);
  const rows = input.projects
    .filter((project) => project.status === 'active' || project.status === 'paused')
    .map((project) => ({
      project,
      daysQuiet: daysUntouched(lastWork.get(project.id) ?? project.lastTouchedAt, now),
      progress: cadenceProgress(project, input.sessions, now, projectOfTask),
      nextCount: input.tasks.filter((task) => task.projectId === project.id && isNextNow(task, now)).length,
    }));
  const rank = (status: Project['status']) => (status === 'active' ? 0 : 1);
  return rows.sort((a, b) => {
    if (rank(a.project.status) !== rank(b.project.status)) return rank(a.project.status) - rank(b.project.status);
    if (a.daysQuiet !== b.daysQuiet) return a.daysQuiet - b.daysQuiet;
    const byTitle = a.project.title.localeCompare(b.project.title);
    if (byTitle !== 0) return byTitle;
    return a.project.id < b.project.id ? -1 : a.project.id > b.project.id ? 1 : 0;
  });
}

/** A project's status in the words the app uses: never "dropped" on screen. */
export function projectStatusLabel(status: Project['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'done':
      return 'Finished';
    case 'dropped':
      return 'Let go';
  }
}

/** How a session ended, in the neutral words of the end-of-session sheet. */
export function outcomeLabel(outcome: SessionOutcome | null | undefined): string | null {
  switch (outcome) {
    case 'done':
      return 'Done';
    case 'progress':
      return 'Progress';
    case 'blocked':
      return 'Blocked';
    default:
      return null;
  }
}
