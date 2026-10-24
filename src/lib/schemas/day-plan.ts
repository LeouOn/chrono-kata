import { z } from 'zod';

/**
 * One plan per local day (YYYY-MM-DD via toLocalDateString), holding the
 * 1–3 picks for today and the plan's capacity. Keyed by date like check-ins.
 */
const DayPlanBaseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Local day key YYYY-MM-DD.'),
  /** Task ids chosen for today, most important first. */
  picks: z.array(z.string().uuid()),
  /** Planned capacity in minutes for this day (Wave 6 computes it). */
  capacityMin: z.number().int().min(0).max(1440),
  shutdownNote: z.string().max(2000).nullable().optional(),
  /** The day's journal entry (roadmap W12). */
  journal: z.string().max(5000).nullable().optional(),
  /**
   * The domains the user ticked at shutdown, keyed by domain id. Optional and
   * non-indexed: a day with no domain checks reads as an empty record.
   */
  domainChecks: z.record(z.string().uuid(), z.boolean()).optional(),
  /** One line for tomorrow's first move, written in the shutdown. */
  firstActionTomorrow: z.string().max(500).nullable().optional(),
  /** Picks the shutdown marked finished (the tasks were set to done too). */
  picksDone: z.array(z.string().uuid()).optional(),
  /**
   * Picks sent back to the list ("back on the list", never "rolled over").
   * Their tasks are `next` again; nothing is deleted or duplicated.
   */
  picksBack: z.array(z.string().uuid()).optional(),
  /** When the shutdown was applied. A second identical shutdown is a no-op. */
  shutdownAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DayPlanSchema = DayPlanBaseSchema;
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const DayPlanInputSchema = DayPlanBaseSchema.omit({
  date: true,
  createdAt: true,
  updatedAt: true,
});
export type DayPlanInput = z.infer<typeof DayPlanInputSchema>;
