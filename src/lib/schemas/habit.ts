import { z } from 'zod';
import { DayOfWeekSchema } from './settings';

export const HabitKindSchema = z.enum(['timed', 'boolean', 'count']);
export type HabitKind = z.infer<typeof HabitKindSchema>;

export const HabitScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekdays'), days: z.array(DayOfWeekSchema).min(1).max(7) }),
]);
export type HabitSchedule = z.infer<typeof HabitScheduleSchema>;

const HabitBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(50),
  icon: z.string().max(10).default('✅'),
  kind: HabitKindSchema,
  /** Count habits only, e.g. "pages". */
  unit: z.string().min(1).max(20).optional(),
  /** Timed minutes or count quantity per scheduled day. Null/absent for boolean habits. */
  targetPerDay: z.number().positive().max(100000).nullable().optional(),
  schedule: HabitScheduleSchema,
  /** Sessions whose activityLabel matches (case-insensitive) count automatically. */
  linkedActivityLabel: z.string().min(1).max(100).nullable().optional(),
  /** Sessions started from this kata count even if the label is later renamed. */
  linkedKataTemplateId: z.string().uuid().nullable().optional(),
  order: z.number().int().default(0),
  archivedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const HabitSchema = HabitBaseSchema.refine(
  (h) => (h.kind === 'boolean') === (h.targetPerDay == null),
  { message: 'targetPerDay must be set for timed/count habits and null for boolean habits.' }
).refine(
  (h) => h.kind !== 'count' || h.unit != null,
  { message: 'Count habits require a unit (e.g. "pages").' }
);

export type Habit = z.infer<typeof HabitSchema>;

export const HabitInputSchema = HabitBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  icon: true,
  unit: true,
  targetPerDay: true,
  linkedActivityLabel: true,
  linkedKataTemplateId: true,
  order: true,
  archivedAt: true,
});

export type HabitInput = z.infer<typeof HabitInputSchema>;

export const HabitLogSourceSchema = z.enum(['manual', 'session']);
export type HabitLogSource = z.infer<typeof HabitLogSourceSchema>;

const HabitLogBaseSchema = z.object({
  id: z.string().uuid(),
  habitId: z.string().uuid(),
  /** Local calendar day, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Timed habits: minutes contributed by this entry. */
  minutes: z.number().finite().positive().nullable().optional(),
  /** Count habits: quantity contributed by this entry (always positive in v1). */
  delta: z.number().int().positive().nullable().optional(),
  note: z.string().max(500).optional(),
  source: HabitLogSourceSchema.default('manual'),
  /** Set when source === 'session'; the session is the source of truth for the entry. */
  sessionId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
});

export const HabitLogSchema = HabitLogBaseSchema.refine(
  (l) => l.source !== 'session' || l.sessionId != null,
  { message: 'Session-sourced habit logs require a sessionId.' }
);

export type HabitLog = z.infer<typeof HabitLogSchema>;

export const HabitLogInputSchema = HabitLogBaseSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  minutes: true,
  delta: true,
  note: true,
  sessionId: true,
});

export type HabitLogInput = z.infer<typeof HabitLogInputSchema>;
