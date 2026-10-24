import { addDays } from '@/lib/pacing/days';
import { sessionProjectId, projectOfTaskIndex } from '@/lib/planning/cadence';
import { mondayOf, weekKeyFor } from '@/lib/review/week';
import type { Estimate } from '@/lib/schemas/estimate';
import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';

/**
 * Wave 13 (PR 1): pure analytics over work history — estimate accuracy,
 * a personal calibration factor, time per domain, project time invested,
 * cadence adherence, and inbox throughput. No UI, no DB, no clock reads:
 * `now` and all rows come from the caller.
 *
 * Attribution rule (same as d1's review stats): a session's minutes belong
 * to its task; a task's domain is its own `domainId`, else its project's.
 * Sessions without a `taskId` are practice, not work, and are excluded from
 * every table here.
 *
 * Calendar concepts: a "week" is a LOCAL Monday-start week derived from day
 * keys (never ms arithmetic), so DST and half-hour zones bucket by the
 * device's calendar the same way the rest of the app does.
 */

/** Ratios are clamped to this range before statistics: one document number. */
export const RATIO_MIN = 0.1;
export const RATIO_MAX = 10;

/** The calibration factor needs at least this many completed, estimated tasks. */
export const CALIBRATION_MIN_SAMPLES = 5;

export interface AnalyticsInput {
  now: Date;
  sessions: readonly Session[];
  tasks: readonly Task[];
  projects: readonly Project[];
  estimates: readonly Estimate[];
}

export interface RatioStats {
  n: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

export type Energy = 'low' | 'med' | 'high';

export interface EstimateAccuracy {
  overall: RatioStats;
  byDomain: Record<string, RatioStats>;
  byEnergy: Record<Energy, RatioStats>;
  bySource: Record<string, RatioStats>;
}

export interface CalibrationResult {
  /** Median user ratio, or null when there is not enough data yet. */
  factor: number | null;
  sampleSize: number;
  basis: 'enough-data' | 'not-enough-data';
}

/** The Monday-start local week a local day key belongs to: the shared
 * `mondayOf` from the review week module, so analytics and review can never
 * disagree about week boundaries. */
export const localWeekKey = mondayOf;

function clampRatio(ratio: number): number {
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
}

/** Nearest-rank quantile on a sorted ascending array (deterministic, documented). */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index]!;
}

function stats(ratios: readonly number[]): RatioStats {
  const sorted = [...ratios].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n === 0 ? Number.NaN : n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  return {
    n,
    median,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: n === 0 ? Number.NaN : sorted[0]!,
    max: n === 0 ? Number.NaN : sorted[n - 1]!,
  };
}

interface TaskRow {
  task: Task;
  domainId: string | null;
  /** Latest estimate per source for this task. */
  latestBySource: Map<string, Estimate>;
  minutes: number;
}

/** Latest estimate per (task, source): ties break on createdAt then id. */
function latestEstimates(estimates: readonly Estimate[]): Map<string, Map<string, Estimate>> {
  const byTask = new Map<string, Map<string, Estimate>>();
  for (const estimate of estimates) {
    let bySource = byTask.get(estimate.taskId);
    if (!bySource) {
      bySource = new Map();
      byTask.set(estimate.taskId, bySource);
    }
    const current = bySource.get(estimate.source);
    if (
      !current ||
      estimate.createdAt > current.createdAt ||
      (estimate.createdAt.getTime() === current.createdAt.getTime() && estimate.id > current.id)
    ) {
      bySource.set(estimate.source, estimate);
    }
  }
  return byTask;
}

function buildRows(input: AnalyticsInput): TaskRow[] {
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const latest = latestEstimates(input.estimates);
  const minutesByTask = new Map<string, number>();
  for (const session of input.sessions) {
    if (session.taskId == null || session.durationMinutes == null) continue;
    minutesByTask.set(session.taskId, (minutesByTask.get(session.taskId) ?? 0) + session.durationMinutes);
  }
  return input.tasks.map((task) => {
    const project = task.projectId != null ? projectsById.get(task.projectId) : undefined;
    return {
      task,
      domainId: task.domainId ?? project?.domainId ?? null,
      latestBySource: latest.get(task.id) ?? new Map<string, Estimate>(),
      minutes: minutesByTask.get(task.id) ?? 0,
    };
  });
}

function ratioOf(row: TaskRow, estimate: Estimate): number {
  return clampRatio(row.minutes / estimate.minutes);
}

/**
 * Distribution of actual/estimated minutes over COMPLETED tasks with an
 * estimate. `actual` is the task's attributed session minutes (Task.actualMin
 * semantics, recomputed from sessions so the analytics are an export of
 * derived data, never a writer of it).
 */
export function estimateAccuracy(input: AnalyticsInput): EstimateAccuracy {
  const rows = buildRows(input).filter(
    (row) => row.task.status === 'done' && row.minutes > 0 && row.latestBySource.size > 0,
  );

  const overall: number[] = [];
  const byDomain = new Map<string, number[]>();
  const byEnergy = new Map<string, number[]>();
  const bySource = new Map<string, number[]>();

  for (const row of rows) {
    for (const estimate of row.latestBySource.values()) {
      const ratio = ratioOf(row, estimate);
      overall.push(ratio);
      if (row.domainId != null) push(byDomain, row.domainId, ratio);
      if (row.task.energy != null) push(byEnergy, row.task.energy, ratio);
      push(bySource, estimate.source, ratio);
    }
  }

  const materialize = (map: Map<string, number[]>) =>
    Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, list]) => [key, stats(list)]));

  return {
    overall: stats(overall),
    byDomain: materialize(byDomain),
    byEnergy: materialize(byEnergy) as Record<Energy, RatioStats>,
    bySource: materialize(bySource),
  };
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * The personal calibration factor: the MEDIAN of the user's own historical
 * ratios (source 'user'), over completed tasks, with ratios clamped to
 * [RATIO_MIN, RATIO_MAX]. Median, not mean, so one wild task cannot drag it;
 * null until CALIBRATION_MIN_SAMPLES tasks have data — the UI must say so
 * plainly. Never rewrites existing estimates; it only scales future input.
 */
export function calibrationFactor(input: AnalyticsInput): CalibrationResult {
  const rows = buildRows(input).filter((row) => row.task.status === 'done' && row.minutes > 0);
  const ratios: number[] = [];
  for (const row of rows) {
    const userEstimate = row.latestBySource.get('user');
    if (userEstimate != null) ratios.push(ratioOf(row, userEstimate));
  }
  if (ratios.length < CALIBRATION_MIN_SAMPLES) {
    return { factor: null, sampleSize: ratios.length, basis: 'not-enough-data' };
  }
  return { factor: stats(ratios).median, sampleSize: ratios.length, basis: 'enough-data' };
}

export interface DomainTime {
  domainId: string | null;
  minutes: number;
  sessions: number;
}

/** Attributed work minutes per domain, in the whole input (caller windows it). */
export function timePerDomain(input: AnalyticsInput): DomainTime[] {
  const rows = buildRows(input);
  const tasksById = new Map(rows.map((r) => [r.task.id, r]));
  const byDomain = new Map<string | null, DomainTime>();
  for (const session of input.sessions) {
    if (session.taskId == null || session.durationMinutes == null) continue;
    const row = tasksById.get(session.taskId);
    if (!row) continue;
    const key = row.domainId;
    const current = byDomain.get(key) ?? { domainId: key, minutes: 0, sessions: 0 };
    current.minutes += session.durationMinutes;
    current.sessions += 1;
    byDomain.set(key, current);
  }
  return [...byDomain.values()].sort((a, b) => b.minutes - a.minutes);
}

export interface ProjectTime {
  projectId: string;
  title: string;
  minutes: number;
  sessions: number;
  lastTouchedAt: Date;
}

export function projectTimeInvested(input: AnalyticsInput): ProjectTime[] {
  // Shared attribution rule (planning/cadence): an explicit session.projectId
  // wins, else the task's project — the Start buttons always link tasks.
  const projectOfTask = projectOfTaskIndex(input.tasks);
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const byProject = new Map<string, ProjectTime>();
  for (const session of input.sessions) {
    if (session.durationMinutes == null) continue;
    const projectId = sessionProjectId(session, projectOfTask);
    if (projectId == null) continue;
    const project = projectsById.get(projectId);
    if (!project) continue;
    const current = byProject.get(project.id) ?? {
      projectId: project.id,
      title: project.title,
      minutes: 0,
      sessions: 0,
      lastTouchedAt: project.lastTouchedAt,
    };
    current.minutes += session.durationMinutes;
    current.sessions += 1;
    if (session.startedAt > current.lastTouchedAt) current.lastTouchedAt = session.startedAt;
    byProject.set(project.id, current);
  }
  return [...byProject.values()].sort((a, b) => b.minutes - a.minutes);
}

export interface CadenceWeek {
  weekKey: string;
  sessions: number;
  target: number;
  met: boolean;
}

export interface CadenceAdherence {
  projectId: string;
  title: string;
  targetPerWeek: number;
  weeks: CadenceWeek[];
  metWeeks: number;
  totalWeeks: number;
}

/**
 * Sessions per LOCAL Monday-start week against the project's cadence target,
 * over the weeks from the project's first attributed session to `now`.
 */
export function cadenceAdherence(input: AnalyticsInput): CadenceAdherence[] {
  const result: CadenceAdherence[] = [];
  const projectOfTask = projectOfTaskIndex(input.tasks);
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const byProject = new Map<string, { project: Project; weeks: Map<string, number> }>();
  for (const session of input.sessions) {
    const projectId = sessionProjectId(session, projectOfTask);
    if (projectId == null) continue;
    const project = projectsById.get(projectId);
    if (!project || project.cadencePerWeek == null) continue;
    const entry = byProject.get(project.id) ?? { project, weeks: new Map<string, number>() };
    const week = weekKeyFor(session.startedAt);
    entry.weeks.set(week, (entry.weeks.get(week) ?? 0) + 1);
    byProject.set(project.id, entry);
  }
  const nowWeek = weekKeyFor(input.now);
  for (const { project, weeks } of byProject.values()) {
    const sorted = [...weeks.keys()].sort();
    if (sorted.length === 0) continue;
    // Weeks from the first session's week to the current week, missing = 0.
    const allWeeks: string[] = [];
    let cursor = sorted[0]!;
    let guard = 0;
    while (cursor <= nowWeek && guard < 520) {
      allWeeks.push(cursor);
      cursor = addDays(cursor, 7); // day-key arithmetic, zone-independent
      guard += 1;
    }
    const weekRows: CadenceWeek[] = allWeeks.map((weekKey) => {
      const sessions = weeks.get(weekKey) ?? 0;
      return { weekKey, sessions, target: project.cadencePerWeek!, met: sessions >= project.cadencePerWeek! };
    });
    result.push({
      projectId: project.id,
      title: project.title,
      // Guarded at collection time (only projects WITH a target are collected).
      targetPerWeek: project.cadencePerWeek!,
      weeks: weekRows,
      metWeeks: weekRows.filter((w) => w.met).length,
      totalWeeks: weekRows.length,
    });
  }
  return result.sort((a, b) => b.metWeeks - a.metWeeks);
}

export interface InboxThroughput {
  captured: number;
  processed: number;
  byWeek: { weekKey: string; captured: number; processed: number }[];
}

/**
 * Captured vs processed inbox tasks among tasks created in the window from
 * `now` back `windowDays`. "Processed" = no longer in `inbox` (current state;
 * transition history is not stored, so a task that went out and came back
 * counts as unprocessed — documented limitation, not a guess).
 */
export function inboxThroughput(input: AnalyticsInput, windowDays = 90): InboxThroughput {
  const from = new Date(input.now);
  from.setDate(from.getDate() - windowDays);
  const fromWeek = weekKeyFor(from);
  const byWeek = new Map<string, { captured: number; processed: number }>();
  let captured = 0;
  let processed = 0;
  for (const task of input.tasks) {
    if (task.createdAt < from) continue;
    captured += 1;
    const isProcessed = task.status !== 'inbox';
    if (isProcessed) processed += 1;
    const week = weekKeyFor(task.createdAt);
    const current = byWeek.get(week) ?? { captured: 0, processed: 0 };
    current.captured += 1;
    if (isProcessed) current.processed += 1;
    byWeek.set(week, current);
  }
  return {
    captured,
    processed,
    byWeek: [...byWeek.entries()]
      .filter(([weekKey]) => weekKey >= fromWeek)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([weekKey, value]) => ({ weekKey, ...value })),
  };
}
