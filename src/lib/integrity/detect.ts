import { SettingsSchema } from '@/lib/schemas/settings';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';
import type { Domain } from '@/lib/schemas/domain';
import type { Block } from '@/lib/schemas/block';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Habit } from '@/lib/schemas/habit';
import type { Settings } from '@/lib/schemas/settings';

/**
 * Wave 20 part 2: a PURE, read-only data-integrity detector (no UI).
 *
 * In: a plain snapshot of the relevant tables. Out: every issue found —
 * exactly, deterministically, and nothing else (the oracle test enforces
 * "no more, no fewer" against seeded random databases with injected
 * corruption). No IO here: the caller collects rows, the detector judges.
 *
 * Two severities:
 *  - `corruption`: the row violates an invariant (dangling link, impossible
 *    timestamp, broken done/status coupling, unreadable settings). A repair
 *    (PR 3) unlinks or normalises — it never deletes a user row.
 *  - `info`: a KNOWN, documented property that looks stale but is not a
 *    broken invariant (a shutdown pick whose task was deleted later). It is
 *    reported so PR 3 can offer a tidy-up (drop the dead id), never as a
 *    fault.
 *
 * Timestamp rules agree with src/lib/data-transfer/dates.ts DATE_SPECS: a
 * date field is core/optional/stamp per that table, and the "impossible
 * timestamp" checks below only fire on fields that table actually has.
 * `KataTemplate` has no `domainId` on main, so no kata-domain rule exists.
 */

/** Created/updated more than a day ahead of "now": impossible, not just odd. */
export const FAR_FUTURE_MS = 24 * 60 * 60 * 1000;

export type IntegritySeverity = 'corruption' | 'info';

export type IntegrityIssue =
  | { kind: 'session-orphan-task'; severity: 'corruption'; sessionId: string; taskId: string }
  | { kind: 'session-orphan-project'; severity: 'corruption'; sessionId: string; projectId: string }
  | { kind: 'session-orphan-block'; severity: 'corruption'; sessionId: string; blockId: string }
  | { kind: 'session-bad-range'; severity: 'corruption'; sessionId: string }
  | { kind: 'block-orphan-task'; severity: 'corruption'; blockId: string; taskId: string }
  | { kind: 'block-orphan-project'; severity: 'corruption'; blockId: string; projectId: string }
  | { kind: 'block-bad-range'; severity: 'corruption'; blockId: string }
  | { kind: 'block-duplicate-calendar-ref'; severity: 'corruption'; blockIds: string[]; calendarRef: string }
  | { kind: 'task-orphan-parent'; severity: 'corruption'; taskId: string; parentId: string }
  | { kind: 'task-orphan-project'; severity: 'corruption'; taskId: string; projectId: string }
  | { kind: 'task-orphan-domain'; severity: 'corruption'; taskId: string; domainId: string }
  | { kind: 'task-done-inconsistent'; severity: 'corruption'; taskId: string }
  | { kind: 'habit-orphan-domain'; severity: 'corruption'; habitId: string; domainId: string }
  | {
      /** DATE_SPECS-aligned impossible timestamps: any core/optional/stamp
       *  date more than a day ahead of now, on the tables that have it. */
      kind: 'row-date-in-future';
      severity: 'corruption';
      table: 'sessions' | 'tasks' | 'blocks' | 'projects' | 'dayPlans';
      id: string;
      field: string;
    }
  | { kind: 'settings-invalid'; severity: 'corruption'; reason: string }
  | {
      /** KNOWN property (documented): a shutdown pick whose task was deleted
       *  after the fact. Informational; a tidy-up would drop the dead id. */
      kind: 'dayplan-dead-pick';
      severity: 'info';
      dayPlanDate: string;
      field: 'picksDone' | 'picksBack';
      taskId: string;
    }
  | {
      /** Same class: a shutdown domain tick keyed by a since-deleted domain.
       *  Historical record — informational only. */
      kind: 'dayplan-dead-domain-check';
      severity: 'info';
      dayPlanDate: string;
      domainId: string;
    };

export interface IntegritySnapshot {
  sessions: readonly Session[];
  tasks: readonly Task[];
  projects: readonly Project[];
  domains: readonly Domain[];
  blocks: readonly Block[];
  dayPlans: readonly DayPlan[];
  habits: readonly Habit[];
  settings: Settings | null;
  now?: Date;
}

function issueKey(issue: IntegrityIssue): string {
  const parts: string[] = [issue.kind];
  switch (issue.kind) {
    case 'block-duplicate-calendar-ref':
      parts.push(issue.calendarRef, issue.blockIds.slice().sort().join(','));
      break;
    case 'settings-invalid':
      parts.push(issue.reason);
      break;
    case 'row-date-in-future':
      parts.push(issue.table, issue.id, issue.field);
      break;
    case 'session-orphan-task':
      parts.push(issue.sessionId, issue.taskId);
      break;
    case 'session-orphan-project':
      parts.push(issue.sessionId, issue.projectId);
      break;
    case 'session-orphan-block':
      parts.push(issue.sessionId, issue.blockId);
      break;
    case 'session-bad-range':
      parts.push(issue.sessionId);
      break;
    case 'block-orphan-task':
      parts.push(issue.blockId, issue.taskId);
      break;
    case 'block-orphan-project':
      parts.push(issue.blockId, issue.projectId);
      break;
    case 'block-bad-range':
      parts.push(issue.blockId);
      break;
    case 'task-orphan-parent':
      parts.push(issue.taskId, issue.parentId);
      break;
    case 'task-orphan-project':
      parts.push(issue.taskId, issue.projectId);
      break;
    case 'task-orphan-domain':
      parts.push(issue.taskId, issue.domainId);
      break;
    case 'task-done-inconsistent':
      parts.push(issue.taskId);
      break;
    case 'habit-orphan-domain':
      parts.push(issue.habitId, issue.domainId);
      break;
    case 'dayplan-dead-pick':
      parts.push(issue.dayPlanDate, issue.field, issue.taskId);
      break;
    case 'dayplan-dead-domain-check':
      parts.push(issue.dayPlanDate, issue.domainId);
      break;
  }
  return parts.join('|');
}

/** A date more than a day ahead of `now` (impossible, not merely future-ish). */
function isFarFuture(at: Date, now: Date): boolean {
  return at.getTime() - now.getTime() > FAR_FUTURE_MS;
}

/**
 * The per-table date fields the future check looks at — aligned with
 * DATE_SPECS in src/lib/data-transfer/dates.ts (core + optional + stamps),
 * restricted to the tables the detector sees.
 */
const FUTURE_DATE_FIELDS = {
  sessions: ['startedAt', 'endedAt', 'createdAt', 'updatedAt'],
  tasks: ['dueAt', 'deferUntil', 'doneAt', 'createdAt', 'touchedAt'],
  blocks: ['start', 'end', 'createdAt', 'updatedAt'],
  projects: ['breadcrumbAt', 'lastTouchedAt', 'createdAt', 'updatedAt'],
  dayPlans: ['shutdownAt', 'createdAt', 'updatedAt'],
} as const satisfies Record<string, readonly string[]>;

type FutureTable = keyof typeof FUTURE_DATE_FIELDS;

function checkFutureDates(
  table: FutureTable,
  id: string,
  row: Record<string, unknown>,
  now: Date,
  issues: IntegrityIssue[]
): void {
  for (const field of FUTURE_DATE_FIELDS[table]) {
    const value = row[field];
    if (value instanceof Date && isFarFuture(value, now)) {
      issues.push({ kind: 'row-date-in-future', severity: 'corruption', table, id, field });
    }
  }
}

/** Detect every issue in the snapshot. Deterministic: sorted, deduplicated. */
export function detectIntegrity(snapshot: IntegritySnapshot): IntegrityIssue[] {
  const now = snapshot.now ?? new Date();
  const taskIds = new Set(snapshot.tasks.map((t) => t.id));
  const projectIds = new Set(snapshot.projects.map((p) => p.id));
  const domainIds = new Set(snapshot.domains.map((d) => d.id));
  const blockIds = new Set(snapshot.blocks.map((b) => b.id));
  const issues: IntegrityIssue[] = [];

  for (const s of snapshot.sessions) {
    if (s.taskId && !taskIds.has(s.taskId)) {
      issues.push({ kind: 'session-orphan-task', severity: 'corruption', sessionId: s.id, taskId: s.taskId });
    }
    if (s.projectId && !projectIds.has(s.projectId)) {
      issues.push({ kind: 'session-orphan-project', severity: 'corruption', sessionId: s.id, projectId: s.projectId });
    }
    if (s.blockId && !blockIds.has(s.blockId)) {
      issues.push({ kind: 'session-orphan-block', severity: 'corruption', sessionId: s.id, blockId: s.blockId });
    }
    if (s.endedAt && s.endedAt.getTime() <= s.startedAt.getTime()) {
      issues.push({ kind: 'session-bad-range', severity: 'corruption', sessionId: s.id });
    }
    checkFutureDates('sessions', s.id, s as unknown as Record<string, unknown>, now, issues);
  }

  const refs = new Map<string, string[]>();
  for (const b of snapshot.blocks) {
    if (b.taskId && !taskIds.has(b.taskId)) {
      issues.push({ kind: 'block-orphan-task', severity: 'corruption', blockId: b.id, taskId: b.taskId });
    }
    if (b.projectId && !projectIds.has(b.projectId)) {
      issues.push({ kind: 'block-orphan-project', severity: 'corruption', blockId: b.id, projectId: b.projectId });
    }
    if (b.end.getTime() <= b.start.getTime()) {
      issues.push({ kind: 'block-bad-range', severity: 'corruption', blockId: b.id });
    }
    if (b.calendarRef) {
      const list = refs.get(b.calendarRef) ?? [];
      list.push(b.id);
      refs.set(b.calendarRef, list);
    }
    checkFutureDates('blocks', b.id, b as unknown as Record<string, unknown>, now, issues);
  }
  for (const [calendarRef, ids] of refs) {
    if (ids.length > 1) {
      issues.push({
        kind: 'block-duplicate-calendar-ref',
        severity: 'corruption',
        blockIds: ids.slice().sort(),
        calendarRef,
      });
    }
  }

  for (const t of snapshot.tasks) {
    if (t.parentId && !taskIds.has(t.parentId)) {
      issues.push({ kind: 'task-orphan-parent', severity: 'corruption', taskId: t.id, parentId: t.parentId });
    }
    if (t.projectId && !projectIds.has(t.projectId)) {
      issues.push({ kind: 'task-orphan-project', severity: 'corruption', taskId: t.id, projectId: t.projectId });
    }
    if (t.domainId && !domainIds.has(t.domainId)) {
      issues.push({ kind: 'task-orphan-domain', severity: 'corruption', taskId: t.id, domainId: t.domainId });
    }
    if ((t.status === 'done') !== (t.doneAt != null)) {
      issues.push({ kind: 'task-done-inconsistent', severity: 'corruption', taskId: t.id });
    }
    checkFutureDates('tasks', t.id, t as unknown as Record<string, unknown>, now, issues);
  }
  for (const p of snapshot.projects) {
    checkFutureDates('projects', p.id, p as unknown as Record<string, unknown>, now, issues);
  }

  for (const plan of snapshot.dayPlans) {
    for (const field of ['picksDone', 'picksBack'] as const) {
      for (const pickId of plan[field] ?? []) {
        if (!taskIds.has(pickId)) {
          issues.push({
            kind: 'dayplan-dead-pick',
            severity: 'info',
            dayPlanDate: plan.date,
            field,
            taskId: pickId,
          });
        }
      }
    }
    for (const domainId of Object.keys(plan.domainChecks ?? {})) {
      if (!domainIds.has(domainId)) {
        issues.push({
          kind: 'dayplan-dead-domain-check',
          severity: 'info',
          dayPlanDate: plan.date,
          domainId,
        });
      }
    }
    checkFutureDates('dayPlans', plan.date, plan as unknown as Record<string, unknown>, now, issues);
  }

  for (const h of snapshot.habits) {
    if (h.domainId && !domainIds.has(h.domainId)) {
      issues.push({ kind: 'habit-orphan-domain', severity: 'corruption', habitId: h.id, domainId: h.domainId });
    }
  }

  if (snapshot.settings != null) {
    const parsed = SettingsSchema.safeParse(snapshot.settings);
    if (!parsed.success) {
      issues.push({
        kind: 'settings-invalid',
        severity: 'corruption',
        reason: parsed.error.issues
          .map((i) => `${i.path.join('.') || 'row'} ${i.message}`)
          .join('; ')
          .slice(0, 300),
      });
    }
  }

  const seen = new Set<string>();
  return issues
    .map((i) => ({ i, k: issueKey(i) }))
    .filter(({ k }) => (seen.has(k) ? false : (seen.add(k), true)))
    .map(({ i }) => i)
    .sort((a, b) => issueKey(a).localeCompare(issueKey(b)));
}

/** Collect a snapshot from the live database (thin IO shell over the pure core). */
export async function collectIntegritySnapshot(db: {
  sessions: { toArray(): Promise<Session[]> };
  tasks: { toArray(): Promise<Task[]> };
  projects: { toArray(): Promise<Project[]> };
  domains: { toArray(): Promise<Domain[]> };
  blocks: { toArray(): Promise<Block[]> };
  dayPlans: { toArray(): Promise<DayPlan[]> };
  habits: { toArray(): Promise<Habit[]> };
  settings: { toArray(): Promise<Settings[]> };
}): Promise<IntegritySnapshot> {
  const [sessions, tasks, projects, domains, blocks, dayPlans, habits, settingsRows] =
    await Promise.all([
      db.sessions.toArray(),
      db.tasks.toArray(),
      db.projects.toArray(),
      db.domains.toArray(),
      db.blocks.toArray(),
      db.dayPlans.toArray(),
      db.habits.toArray(),
      db.settings.toArray(),
    ]);
  return {
    sessions,
    tasks,
    projects,
    domains,
    blocks,
    dayPlans,
    habits,
    settings: settingsRows[0] ?? null,
  };
}
