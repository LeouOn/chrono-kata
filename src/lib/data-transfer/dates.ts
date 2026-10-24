/**
 * Reading dates out of a backup file, and what to do when one cannot be read.
 *
 * Dates travel as ISO text. A date that does not parse used to cost the WHOLE row, which is right for
 * a session's start (the row means nothing without it) and wrong for metadata that sits beside
 * irreplaceable writing: a day plan whose `shutdownAt` is damaged is still the day's journal. The rule,
 * per table (`DATE_SPECS`), is one of three:
 *
 *  - **core**: the row means nothing without it, so an unreadable value skips the row (and the skip
 *    is counted and shown);
 *  - **optional**: metadata the schema allows to be absent, so an unreadable value is dropped, the row
 *    is kept and counted as REPAIRED;
 *  - **stamp**: a required bookkeeping time (`createdAt`, `updatedAt`, ...), so an unreadable value
 *    takes another readable stamp from the same row, and failing that the time the backup was made,
 *    the row is kept and counted as REPAIRED.
 *
 * An absent field is not "unreadable": it stays absent and the schema decides (a missing required
 * field still skips the row). Only dates are repaired; any other invalid field still skips the row.
 */

type Row = Record<string, unknown>;

export function reviveDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface DateSpec {
  core?: readonly string[];
  optional?: readonly string[];
  stamps?: readonly string[];
  /** Optional fields that are required stamps under a condition (a done task has a `doneAt`). */
  stampsWhen?: Readonly<Record<string, (row: Row) => boolean>>;
}

const BOTH_STAMPS = { stamps: ['createdAt', 'updatedAt'] } as const;

/** Every date field of every table, by where it falls in the rule above. Tested against the Zod schemas. */
export const DATE_SPECS = {
  sessions: { core: ['startedAt'], optional: ['endedAt'], ...BOTH_STAMPS },
  reflections: { core: ['periodStart', 'periodEnd'], stamps: ['createdAt'] },
  kataTemplates: BOTH_STAMPS,
  conversations: BOTH_STAMPS,
  messages: { optional: ['editedAt'], stamps: ['createdAt'] },
  habits: { optional: ['archivedAt'], ...BOTH_STAMPS },
  habitLogs: { stamps: ['createdAt'] },
  checkIns: BOTH_STAMPS,
  domains: BOTH_STAMPS,
  projects: { optional: ['breadcrumbAt'], stamps: ['lastTouchedAt', 'createdAt', 'updatedAt'] },
  tasks: {
    optional: ['dueAt', 'deferUntil', 'doneAt'],
    stamps: ['createdAt', 'touchedAt'],
    stampsWhen: { doneAt: (row: Row) => row.status === 'done' },
  },
  blocks: { core: ['start', 'end'], ...BOTH_STAMPS },
  dayPlans: { optional: ['shutdownAt'], ...BOTH_STAMPS },
  estimates: BOTH_STAMPS,
  reviews: BOTH_STAMPS,
  reviewDrafts: { stamps: ['updatedAt'] },
  streak: { stamps: ['updatedAt'] },
  settings: { optional: ['googleCalendarConnectedAt', 'lastStreakFreezeUsedAt'], ...BOTH_STAMPS },
  llmSettings: { stamps: ['totalTokensResetAt', 'updatedAt'] },
} as const satisfies Record<string, DateSpec>;

export type DateSpecKey = keyof typeof DATE_SPECS;

const SIBLING_STAMPS = ['updatedAt', 'createdAt', 'touchedAt', 'lastTouchedAt'] as const;
/** A done task's finish time is best estimated by when it was last touched. */
const FALLBACK_ORDER: Record<string, readonly string[]> = { doneAt: ['touchedAt', 'updatedAt', 'createdAt', 'lastTouchedAt'] };

export interface RevivedDates {
  row: Row;
  /** The fields that could not be read and were dropped or replaced. */
  repaired: string[];
}

/** null: the row is skipped (a core date could not be read). */
export function reviveDates(row: Row, spec: DateSpec, backupTime: Date): RevivedDates | null {
  const out: Row = { ...row };
  const repaired: string[] = [];
  const unreadableStamps: string[] = [];

  for (const field of spec.core ?? []) {
    if (row[field] === undefined) continue;
    const date = reviveDate(row[field]);
    if (!date) return null;
    out[field] = date;
  }

  for (const field of spec.optional ?? []) {
    const value = row[field];
    if (value === undefined || value === null) continue; // absent stays absent, null stays null
    const date = reviveDate(value);
    if (date) out[field] = date;
    else {
      // (A done task's finish time is also a stamp, below, and is put back there.)
      delete out[field];
      repaired.push(field);
    }
  }

  const stamps = [...(spec.stamps ?? [])];
  for (const [field, applies] of Object.entries(spec.stampsWhen ?? {})) if (applies(row) && !stamps.includes(field)) stamps.push(field);
  for (const field of stamps) {
    const value = row[field];
    if (value === undefined || value === null || out[field] instanceof Date) continue;
    const date = reviveDate(value);
    if (date) out[field] = date;
    else if (!unreadableStamps.includes(field)) unreadableStamps.push(field);
  }

  for (const field of unreadableStamps) {
    const sibling = (FALLBACK_ORDER[field] ?? SIBLING_STAMPS).map((name) => (name === field ? null : reviveDate(row[name]))).find((d) => d !== null);
    out[field] = sibling ?? backupTime;
    repaired.push(field);
  }

  return { row: out, repaired: [...new Set(repaired)] };
}
