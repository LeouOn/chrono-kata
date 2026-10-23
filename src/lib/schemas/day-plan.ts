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
  /** Reserved for Wave 12's journal; kept here per the roadmap entity. */
  journal: z.string().max(5000).nullable().optional(),
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
