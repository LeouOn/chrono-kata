/**
 * Pick ranking (roadmap Wave 6): which 1–3 things to do today.
 *
 * The ranking is a small, explainable score. Every point that a suggestion
 * earns comes with a sentence the user can read, and every sentence is
 * neutral: a date that has passed raises the priority of a task quietly, and
 * nothing in the wording says that anything is late, overdue or behind.
 *
 * | Signal            | Points | Why |
 * |-------------------|--------|-----|
 * | due date          | 0–40   | A date that is close, or has passed, moves the task up. |
 * | cadence debt      | 0–45   | A project that wants N a week and has had fewer moves up. |
 * | energy fit        | 0/10   | A task whose comfortable block still fits in what is left. |
 * | domain balance    | 0/10   | A domain that has had little time today moves up. |
 *
 * Ties break by `createdAt` and then by `id`, so the same input always gives
 * the same output.
 */

import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { AnchorInterval } from './anchors';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from '@/lib/pacing/days';

const DAY_MS = 86_400_000;

/** Points by how close the due date is. */
const DUE_POINTS = { passed: 40, within3: 30, within7: 20, within14: 10 } as const;

/** Points per session of cadence debt. */
const CADENCE_POINTS_PER_SESSION = 15;
const CADENCE_POINTS_MAX = 45;

/** Points when the task still fits in what is left of the day. */
const ENERGY_POINTS = 10;

/** Points when the task's domain has had little time today. */
const BALANCE_POINTS = 10;

/**
 * The comfortable size of a task by how much energy it asks for.
 *
 * These are the roadmap's "small > big" sizes: the smallest startable action
 * is at most 25 minutes and startable in 5.
 */
export const ENERGY_BLOCK_MINUTES: Record<'low' | 'med' | 'high', number> = {
  low: 10,
  med: 25,
  high: 45,
};

/** How many picks to suggest at most. */
export const MAX_PICKS = 3;

/** How many picks one project may take when other projects are available. */
export const MAX_PICKS_PER_PROJECT = 2;

/** The estimate used for a task that has none. */
export const DEFAULT_TASK_MINUTES = 25;

export interface RankPicksInput {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  /** Sessions from the last week, used for cadence debt. */
  readonly recentSessions: readonly Session[];
  /** Minutes already spent per domain id, today. */
  readonly domainTime: Readonly<Record<string, number>>;
  /** The day's capacity. */
  readonly capacity: { readonly capacityMin: number };
  readonly now: Date;
  /** Today's anchor windows; other domains are kept out of them. */
  readonly anchors?: readonly AnchorInterval[];
  /** Domain names, used in the reason text. */
  readonly domains?: readonly { readonly id: string; readonly name: string }[];
}

export interface RankedPick {
  readonly task: Task;
  readonly score: number;
  readonly reasons: string[];
}

/** Whole local calendar days between two day keys (negative when `to` is past). */
function calendarDaysBetween(fromKey: string, toKey: string): number {
  const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
  const [fy, fm, fd] = parts(fromKey);
  const [ty, tm, td] = parts(toKey);
  // Date.UTC on bare calendar dates has no DST, so the difference is exact.
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

function duePoints(task: Task, now: Date): { points: number; reason?: string } {
  if (!task.dueAt) return { points: 0 };
  // Local calendar days, not 24-hour elapsed time: a due date at 00:00 tomorrow
  // is one day away at 23:00 tonight, not "passed".
  const dayKey = toLocalDateString(task.dueAt);
  const days = calendarDaysBetween(toLocalDateString(now), dayKey);
  if (days <= 0) {
    // The date has passed. Say what it is; do not say it is late.
    return { points: DUE_POINTS.passed, reason: `due ${dayKey}` };
  }
  if (days <= 3) return { points: DUE_POINTS.within3, reason: `due ${dayKey}` };
  if (days <= 7) return { points: DUE_POINTS.within7, reason: `due ${dayKey}` };
  if (days <= 14) return { points: DUE_POINTS.within14, reason: `due ${dayKey}` };
  return { points: 0 };
}

function sessionsInLastWeek(projectId: string, sessions: readonly Session[], now: Date): number {
  // The last seven LOCAL days, today included. Elapsed-time windows drift by an
  // hour across a DST change and can include or drop a session at the edge.
  const todayKey = toLocalDateString(now);
  const days = new Set<string>();
  for (let offset = 0; offset < 7; offset += 1) days.add(addDays(todayKey, -offset));
  return sessions.filter(
    (session) => session.projectId === projectId && days.has(toLocalDateString(session.startedAt)),
  ).length;
}

/**
 * How many sessions a project still wants this week.
 *
 * The count is the project's own rhythm minus the sessions it has had in the
 * last seven days, never below zero.
 */
export function cadenceDebt(project: Project, sessions: readonly Session[], now: Date): number {
  const wanted = project.cadencePerWeek ?? 0;
  if (wanted <= 0) return 0;
  return Math.max(0, wanted - sessionsInLastWeek(project.id, sessions, now));
}

/**
 * Minutes of anchor windows that belong to the task's own domain.
 *
 * `computeCapacity` already removed every anchor from the capacity, so a task
 * never *loses* anchor time; a task only *gains* the windows of its own domain,
 * because other domains are kept out of those by construction.
 */
function anchorMinutesForSameDomain(
  anchors: readonly AnchorInterval[],
  domainId: string | null | undefined,
): number {
  const spans = anchors
    .filter((anchor) => !!anchor.domainId && anchor.domainId === domainId)
    .map((anchor) => ({
      start: anchor.start.getTime(),
      end: anchor.end.getTime(),
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const span of spans) {
    if (currentStart === null) {
      currentStart = span.start;
      currentEnd = span.end;
      continue;
    }
    if (span.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, span.end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = span.start;
    currentEnd = span.end;
  }
  if (currentStart !== null) total += currentEnd - currentStart;
  return Math.round(total / 60_000);
}

/**
 * Suggest up to three tasks for today, most useful first.
 *
 * Only tasks with the status `next` are considered, and a task that is
 * deferred until later is left alone until then.
 */
export function rankPicks(input: RankPicksInput): RankedPick[] {
  const { now, capacity } = input;
  const projectById = new Map(input.projects.map((project) => [project.id, project] as const));
  const domainName = new Map((input.domains ?? []).map((domain) => [domain.id, domain.name] as const));

  const candidates = input.tasks.filter((task) => {
    if (task.status !== 'next') return false;
    if (task.deferUntil && task.deferUntil.getTime() > now.getTime()) return false;
    return true;
  });

  const scored = candidates.map((task) => {
    const reasons: string[] = [];
    let score = 0;

    const due = duePoints(task, now);
    score += due.points;
    if (due.reason) reasons.push(due.reason);

    const project = task.projectId ? projectById.get(task.projectId) : undefined;
    if (project && project.status === 'active') {
      const debt = cadenceDebt(project, input.recentSessions, now);
      if (debt > 0) {
        score += Math.min(CADENCE_POINTS_MAX, debt * CADENCE_POINTS_PER_SESSION);
        const had = project.cadencePerWeek! - debt;
        reasons.push(
          `${project.title} wants ${project.cadencePerWeek} a week and has had ${had} this week`,
        );
      }
    }

    const estimate = task.estimateMin ?? DEFAULT_TASK_MINUTES;
    const anchors = input.anchors ?? [];
    const ownDomainAnchorMin = anchorMinutesForSameDomain(anchors, task.domainId);
    const availableMin = Math.max(0, capacity.capacityMin + ownDomainAnchorMin);
    if (estimate > availableMin) {
      // It does not fit today, so it is not one of today's picks.
      return null;
    }

    const energy = task.energy ?? 'low';
    const comfortable = ENERGY_BLOCK_MINUTES[energy];
    if (comfortable <= availableMin) {
      score += ENERGY_POINTS;
      reasons.push(`fits the ${availableMin} minutes you have today`);
    }

    if (task.domainId) {
      const spent = input.domainTime[task.domainId] ?? 0;
      if (spent * 3 < capacity.capacityMin) {
        score += BALANCE_POINTS;
        const name = domainName.get(task.domainId) ?? 'That domain';
        reasons.push(`${name} has had little time today`);
      }
    }

    return { task, score, reasons };
  });

  const eligible = scored.filter((entry): entry is { task: Task; score: number; reasons: string[] } =>
    entry !== null,
  );

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const createdA = a.task.createdAt.getTime();
    const createdB = b.task.createdAt.getTime();
    if (createdA !== createdB) return createdA - createdB;
    return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
  });

  // One project may not fill every pick when other projects are available.
  const projectIds = new Set(eligible.map((entry) => entry.task.projectId ?? null));
  const limitPerProject = projectIds.size >= 2 ? MAX_PICKS_PER_PROJECT : MAX_PICKS;

  const picked: RankedPick[] = [];
  const perProject = new Map<string | null, number>();
  for (const entry of eligible) {
    if (picked.length >= MAX_PICKS) break;
    const projectId = entry.task.projectId ?? null;
    const used = perProject.get(projectId) ?? 0;
    if (used >= limitPerProject) continue;
    perProject.set(projectId, used + 1);
    picked.push(entry);
  }

  return picked;
}
