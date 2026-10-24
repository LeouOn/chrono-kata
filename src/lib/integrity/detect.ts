import { DATE_SPECS, type DateSpec } from '@/lib/data-transfer/dates';
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
 * Wave 20 part 2: a PURE, read-only, TOTAL data-integrity detector (no UI).
 *
 * In: a plain snapshot of the relevant tables — rows exactly as they sit in
 * Dexie, which may not match their Zod types. Out: every issue found —
 * exactly, deterministically, and nothing else (the oracle enforces "no
 * more, no fewer"; the lead's real-repository probes enforce "ordinary use
 * is clean").
 *
 * TOTALITY: the detector never throws, whatever a row holds. Every field
 * access goes through safe readers; a value that should be a date but is
 * not a valid Date is reported as `row-date-unreadable`, and any rule that
 * would have used it stands down for that row (one issue, not two).
 *
 * One source of truth for date fields: the per-table field lists are
 * DERIVED from DATE_SPECS (src/lib/data-transfer/dates.ts — core, optional,
 * stamps and stampsWhen). The far-future check applies only to fields that
 * record something that HAPPENED; planned fields (a task due next month, a
 * block scheduled for Tuesday) are excluded BY NAME in PLANNED_DATE_FIELDS.
 * The completeness test fails if DATE_SPECS and these lists ever drift.
 *
 * Severities: `corruption` is a broken invariant; `info` is a KNOWN,
 * documented property (DayPlan shutdown picks/domain ticks outliving their
 * rows). UI copy in part 3 must say "links to something that is gone",
 * never "corruption", and never red.
 */

/** Recorded/updated more than a day ahead of "now": impossible, not planned. */
export const FAR_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * Date fields that record PLANS, not events — excluded from the far-future
 * check. Everything else in DATE_SPECS (per detector table) is checked.
 * Every name here must exist in DATE_SPECS for its table (completeness test).
 */
export const PLANNED_DATE_FIELDS = {
  tasks: ['dueAt', 'deferUntil'],
  blocks: ['start', 'end'],
} as const satisfies Record<string, readonly string[]>;

/** The tables this detector looks at (subset of DATE_SPECS keys). */
export const DETECTOR_TABLES = ['sessions', 'tasks', 'blocks', 'projects', 'dayPlans'] as const;
export type DetectorTable = (typeof DETECTOR_TABLES)[number];

function specFields(table: DetectorTable): string[] {
  const spec: DateSpec = DATE_SPECS[table];
  const fields = [
    ...(spec.core ?? []),
    ...(spec.optional ?? []),
    ...(spec.stamps ?? []),
    ...(spec.stampsWhen ? (Object.keys(spec.stampsWhen) as string[]) : []),
  ];
  return [...new Set(fields)];
}

/** All DATE_SPECS date fields of a table — the unreadable check covers these. */
export function unreadableDateFields(table: DetectorTable): readonly string[] {
  return specFields(table);
}

/** Event fields: DATE_SPECS fields minus the planned exclusions — the future check. */
export function futureDateFields(table: DetectorTable): readonly string[] {
  const planned: readonly string[] = PLANNED_DATE_FIELDS[table as keyof typeof PLANNED_DATE_FIELDS] ?? [];
  return specFields(table).filter((f) => !planned.includes(f));
}

export type IntegritySeverity = 'corruption' | 'info';

export type IntegrityIssue =
  | { kind: 'session-orphan-task'; severity: 'corruption'; sessionId: string; taskId: string }
  | { kind: 'session-orphan-project'; severity: 'corruption'; sessionId: string; projectId: string }
  | { kind: 'session-orphan-block'; severity: 'corruption'; sessionId: string; blockId: string }
  /** Ends strictly BEFORE it starts (a zero-length session is legal per SessionSchema). */
  | { kind: 'session-bad-range'; severity: 'corruption'; sessionId: string }
  | { kind: 'block-orphan-task'; severity: 'corruption'; blockId: string; taskId: string }
  | { kind: 'block-orphan-project'; severity: 'corruption'; blockId: string; projectId: string }
  | { kind: 'block-bad-range'; severity: 'corruption'; blockId: string }
  /**
   * The same external occurrence twice: one calendarRef AND the same start
   * instant. A recurring event legitimately shares its calendarRef (the UID)
   * across occurrence blocks with different starts — that is the designed
   * shape, not a duplicate.
   */
  | {
      kind: 'block-duplicate-calendar-ref';
      severity: 'corruption';
      blockIds: string[];
      calendarRef: string;
      startIso: string;
    }
  | { kind: 'project-orphan-domain'; severity: 'corruption'; projectId: string; domainId: string }
  | { kind: 'task-orphan-parent'; severity: 'corruption'; taskId: string; parentId: string }
  | { kind: 'task-orphan-project'; severity: 'corruption'; taskId: string; projectId: string }
  | { kind: 'task-orphan-domain'; severity: 'corruption'; taskId: string; domainId: string }
  | { kind: 'task-done-inconsistent'; severity: 'corruption'; taskId: string }
  | { kind: 'habit-orphan-domain'; severity: 'corruption'; habitId: string; domainId: string }
  | {
      kind: 'row-date-in-future';
      severity: 'corruption';
      table: DetectorTable;
      id: string;
      field: string;
    }
  | {
      /** Present but not a valid Date (wrong type, or NaN): unreadable. */
      kind: 'row-date-unreadable';
      severity: 'corruption';
      table: DetectorTable;
      id: string;
      field: string;
    }
  | { kind: 'settings-invalid'; severity: 'corruption'; reason: string }
  | {
      /** KNOWN property: a shutdown pick whose task was deleted later. */
      kind: 'dayplan-dead-pick';
      severity: 'info';
      dayPlanDate: string;
      field: 'picksDone' | 'picksBack';
      taskId: string;
    }
  | {
      /** KNOWN property: a shutdown domain tick keyed by a since-deleted domain. */
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

// ── Safe readers: the code never trusts the row's declared type ──────────────

function rowOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** A valid Date, or null. Everything date-shaped goes through here. */
function validDate(value: unknown): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

/** A stored id-link: non-empty string, or null (absent/null means no link). */
function linkOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isFarFuture(at: Date, now: Date): boolean {
  return at.getTime() - now.getTime() > FAR_FUTURE_MS;
}

function issueKey(issue: IntegrityIssue): string {
  const parts: string[] = [issue.kind];
  switch (issue.kind) {
    case 'block-duplicate-calendar-ref':
      parts.push(issue.calendarRef, issue.startIso, issue.blockIds.slice().sort().join(','));
      break;
    case 'settings-invalid':
      parts.push(issue.reason);
      break;
    case 'row-date-in-future':
    case 'row-date-unreadable':
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
    case 'project-orphan-domain':
      parts.push(issue.projectId, issue.domainId);
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

/** Detect every issue in the snapshot. Deterministic: sorted, deduplicated. */
export function detectIntegrity(snapshot: IntegritySnapshot): IntegrityIssue[] {
  const now = snapshot.now ?? new Date();
  const taskIds = new Set(snapshot.tasks.map((t) => rowOf(t).id).filter((v): v is string => typeof v === 'string'));
  const projectIds = new Set(snapshot.projects.map((p) => rowOf(p).id).filter((v): v is string => typeof v === 'string'));
  const domainIds = new Set(snapshot.domains.map((d) => rowOf(d).id).filter((v): v is string => typeof v === 'string'));
  const blockIds = new Set(snapshot.blocks.map((b) => rowOf(b).id).filter((v): v is string => typeof v === 'string'));
  const issues: IntegrityIssue[] = [];

  /**
   * Date checks per row: unreadable first (present-but-not-a-Date), then
   * far-future on event fields only. Returns which fields were unreadable,
   * so range rules can stand down for those rows.
   */
  function checkDates(table: DetectorTable, id: string, raw: Record<string, unknown>): Set<string> {
    const unreadable = new Set<string>();
    for (const field of unreadableDateFields(table)) {
      const value = raw[field];
      if (value === undefined || value === null) continue; // absent is the schema's business
      if (validDate(value)) continue;
      unreadable.add(field);
      issues.push({ kind: 'row-date-unreadable', severity: 'corruption', table, id, field });
    }
    for (const field of futureDateFields(table)) {
      if (unreadable.has(field)) continue; // already reported as unreadable
      const at = validDate(raw[field]);
      if (at && isFarFuture(at, now)) {
        issues.push({ kind: 'row-date-in-future', severity: 'corruption', table, id, field });
      }
    }
    return unreadable;
  }

  for (const s of snapshot.sessions) {
    const raw = rowOf(s);
    const id = typeof raw.id === 'string' ? raw.id : '(no id)';
    const task = linkOf(raw.taskId);
    if (task && !taskIds.has(task)) {
      issues.push({ kind: 'session-orphan-task', severity: 'corruption', sessionId: id, taskId: task });
    }
    const project = linkOf(raw.projectId);
    if (project && !projectIds.has(project)) {
      issues.push({ kind: 'session-orphan-project', severity: 'corruption', sessionId: id, projectId: project });
    }
    const blk = linkOf(raw.blockId);
    if (blk && !blockIds.has(blk)) {
      issues.push({ kind: 'session-orphan-block', severity: 'corruption', sessionId: id, blockId: blk });
    }
    checkDates('sessions', id, raw);
    const started = validDate(raw.startedAt);
    const ended = validDate(raw.endedAt);
    // Ends strictly BEFORE it starts. Equality is a legal zero-length session
    // (SessionSchema has no end>start refine). Unreadable endpoints read as
    // null here — they were already reported and this check stands down.
    if (started && ended && ended.getTime() < started.getTime()) {
      issues.push({ kind: 'session-bad-range', severity: 'corruption', sessionId: id });
    }
  }

  /** calendarRef + start instant → block ids. The recurring-event key. */
  const refs = new Map<string, { calendarRef: string; startMs: number; ids: string[] }>();
  for (const b of snapshot.blocks) {
    const raw = rowOf(b);
    const id = typeof raw.id === 'string' ? raw.id : '(no id)';
    const task = linkOf(raw.taskId);
    if (task && !taskIds.has(task)) {
      issues.push({ kind: 'block-orphan-task', severity: 'corruption', blockId: id, taskId: task });
    }
    const project = linkOf(raw.projectId);
    if (project && !projectIds.has(project)) {
      issues.push({ kind: 'block-orphan-project', severity: 'corruption', blockId: id, projectId: project });
    }
    checkDates('blocks', id, raw);
    const start = validDate(raw.start);
    const end = validDate(raw.end);
    // BlockSchema forbids equality: a zero-length or reversed block is bad.
    if (start && end && end.getTime() <= start.getTime()) {
      issues.push({ kind: 'block-bad-range', severity: 'corruption', blockId: id });
    }
    const ref = linkOf(raw.calendarRef);
    if (ref && start) {
      const key = JSON.stringify([ref, start.getTime()]);
      const occurrence = refs.get(key) ?? { calendarRef: ref, startMs: start.getTime(), ids: [] };
      occurrence.ids.push(id);
      refs.set(key, occurrence);
    }
  }
  for (const occurrence of refs.values()) {
    if (occurrence.ids.length > 1) {
      issues.push({
        kind: 'block-duplicate-calendar-ref',
        severity: 'corruption',
        blockIds: occurrence.ids.slice().sort(),
        calendarRef: occurrence.calendarRef,
        startIso: new Date(occurrence.startMs).toISOString(),
      });
    }
  }

  for (const t of snapshot.tasks) {
    const raw = rowOf(t);
    const id = typeof raw.id === 'string' ? raw.id : '(no id)';
    const parent = linkOf(raw.parentId);
    if (parent && !taskIds.has(parent)) {
      issues.push({ kind: 'task-orphan-parent', severity: 'corruption', taskId: id, parentId: parent });
    }
    const project = linkOf(raw.projectId);
    if (project && !projectIds.has(project)) {
      issues.push({ kind: 'task-orphan-project', severity: 'corruption', taskId: id, projectId: project });
    }
    const domain = linkOf(raw.domainId);
    if (domain && !domainIds.has(domain)) {
      issues.push({ kind: 'task-orphan-domain', severity: 'corruption', taskId: id, domainId: domain });
    }
    const status = raw.status;
    const doneAt = raw.doneAt;
    if ((status === 'done') !== (doneAt != null && doneAt !== undefined)) {
      issues.push({ kind: 'task-done-inconsistent', severity: 'corruption', taskId: id });
    }
    checkDates('tasks', id, raw);
  }

  for (const p of snapshot.projects) {
    const raw = rowOf(p);
    const id = typeof raw.id === 'string' ? raw.id : '(no id)';
    const domain = linkOf(raw.domainId);
    if (domain && !domainIds.has(domain)) {
      issues.push({ kind: 'project-orphan-domain', severity: 'corruption', projectId: id, domainId: domain });
    }
    checkDates('projects', id, raw);
  }

  for (const plan of snapshot.dayPlans) {
    const raw = rowOf(plan);
    const id = typeof raw.date === 'string' ? raw.date : '(no date)';
    for (const field of ['picksDone', 'picksBack'] as const) {
      const picks = raw[field];
      if (!Array.isArray(picks)) continue;
      for (const pick of picks) {
        const pickId = linkOf(pick);
        if (pickId && !taskIds.has(pickId)) {
          issues.push({ kind: 'dayplan-dead-pick', severity: 'info', dayPlanDate: id, field, taskId: pickId });
        }
      }
    }
    const checks = raw.domainChecks;
    if (typeof checks === 'object' && checks !== null) {
      for (const domainId of Object.keys(checks as Record<string, unknown>)) {
        if (!domainIds.has(domainId)) {
          issues.push({ kind: 'dayplan-dead-domain-check', severity: 'info', dayPlanDate: id, domainId });
        }
      }
    }
    checkDates('dayPlans', id, raw);
  }

  for (const h of snapshot.habits) {
    const raw = rowOf(h);
    const id = typeof raw.id === 'string' ? raw.id : '(no id)';
    const domain = linkOf(raw.domainId);
    if (domain && !domainIds.has(domain)) {
      issues.push({ kind: 'habit-orphan-domain', severity: 'corruption', habitId: id, domainId: domain });
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
