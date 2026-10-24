/**
 * What the completeness oracle knows about each Dexie table: its Zod schema (the field list), how many
 * rows to seed, and how to nudge a generated row across a cross-field refinement.
 *
 * The TABLE LIST is not here: the oracle reads it from `getDb().tables`, and fails when a table has no
 * entry below (so a new table cannot be added without deciding whether it is backed up). The FIELD LIST
 * is the schema's own, walked by `zod-gen`.
 */
import type { ZodTypeAny } from 'zod';
import { BlockSchema } from '@/lib/schemas/block';
import { CheckInSchema } from '@/lib/schemas/check-in';
import { ConversationSchema } from '@/lib/schemas/conversation';
import { DayPlanSchema } from '@/lib/schemas/day-plan';
import { DomainSchema } from '@/lib/schemas/domain';
import { EstimateSchema } from '@/lib/schemas/estimate';
import { HabitLogSchema, HabitSchema } from '@/lib/schemas/habit';
import { KataTemplateSchema } from '@/lib/schemas/kata-template';
import { LLMSettingsSchema } from '@/lib/schemas/llm-settings';
import { MessageSchema } from '@/lib/schemas/message';
import { PendingCalendarOpSchema } from '@/lib/schemas/pending-calendar-op';
import { ProjectSchema } from '@/lib/schemas/project';
import { ReflectionSchema } from '@/lib/schemas/reflection';
import { ReviewDraftSchema, ReviewSchema } from '@/lib/schemas/review';
import { SessionSchema } from '@/lib/schemas/session';
import { SettingsSchema } from '@/lib/schemas/settings';
import { StreakSchema } from '@/lib/schemas/streak';
import { TaskSchema } from '@/lib/schemas/task';
import { TokenSchema } from '@/lib/schemas/token';

export type Row = Record<string, unknown>;

export interface TableSpec {
  schema: ZodTypeAny;
  /** Rows to seed (singleton tables always seed one). */
  rows: number;
  /** Nudge a generated row across a cross-field refinement the generic generator cannot see. */
  repair?: (row: Row, index: number) => Row;
}

export const TABLE_SPECS: Record<string, TableSpec> = {
  sessions: {
    schema: SessionSchema,
    rows: 14,
    // Exactly one of durationMinutes / reps: alternate, so both shapes are seeded.
    repair: (row, i) => (i % 2 === 0 ? { ...row, reps: null } : { ...row, durationMinutes: null }),
  },
  reflections: { schema: ReflectionSchema, rows: 6 },
  streak: { schema: StreakSchema, rows: 1 },
  settings: { schema: SettingsSchema, rows: 1 },
  llmSettings: { schema: LLMSettingsSchema, rows: 1 },
  pendingCalendarOps: { schema: PendingCalendarOpSchema, rows: 5 },
  tokens: { schema: TokenSchema, rows: 1 },
  conversations: { schema: ConversationSchema, rows: 5 },
  messages: { schema: MessageSchema, rows: 12 },
  kataTemplates: { schema: KataTemplateSchema, rows: 6 },
  habits: {
    schema: HabitSchema,
    rows: 9,
    // Boolean habits have no daily target; count habits need a unit.
    repair: (row) => (row.kind === 'boolean' ? { ...row, targetPerDay: null } : row),
  },
  habitLogs: { schema: HabitLogSchema, rows: 14 },
  checkIns: { schema: CheckInSchema, rows: 8 },
  domains: { schema: DomainSchema, rows: 6 },
  projects: { schema: ProjectSchema, rows: 8 },
  tasks: {
    schema: TaskSchema,
    rows: 16,
    // doneAt is set exactly when the task is done.
    repair: (row) => {
      if (row.status === 'done') return row;
      const { doneAt: _doneAt, ...rest } = row;
      return rest;
    },
  },
  blocks: {
    schema: BlockSchema,
    rows: 10,
    repair: (row) => {
      const start = row.start as Date;
      const end = row.end as Date;
      return end.getTime() > start.getTime() ? row : { ...row, end: new Date(start.getTime() + 45 * 60_000) };
    },
  },
  dayPlans: { schema: DayPlanSchema, rows: 7 },
  estimates: { schema: EstimateSchema, rows: 9 },
  reviews: { schema: ReviewSchema, rows: 6 },
  reviewDrafts: { schema: ReviewDraftSchema, rows: 4 },
};

/**
 * Tables the backup deliberately does NOT carry, with the reason. The oracle fails for a table that is
 * in neither this list nor the exported set, and the export must REPORT these (see `leftOut`).
 */
export const LEFT_OUT: Record<string, string> = {
  tokens: 'Google sign-in credentials. A plain backup never holds secrets.',
  pendingCalendarOps: 'Calendar updates waiting to be sent from this device; they belong to the sessions on this device.',
};
