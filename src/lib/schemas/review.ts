import { z } from 'zod';
import { WeekKeySchema } from '@/lib/review/week';
import { WeeklyStatsSchema, type WeeklyStats } from '@/lib/review/stats';

/** The six steps of the review wizard; drafts store a zero-based step. */
export const REVIEW_STEP_COUNT = 6;

/**
 * A completed weekly review (roadmap Wave 11).
 *
 * Keyed by the local Monday of its week: one review per week. `notes` is the
 * user's own writing and is the same 10,000-character bound the wizard must
 * enforce before saving. `statsSnapshot` is optional so a review can be
 * completed even when the numbers could not be computed.
 */
export const ReviewSchema = z.object({
  weekOf: WeekKeySchema,
  notes: z.string().max(10_000).default(''),
  statsSnapshot: WeeklyStatsSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Review = z.infer<typeof ReviewSchema>;

/**
 * Wizard progress, so a review can be paused and resumed without losing work.
 *
 * `decisions` is owned by the wizard: each step records what the user chose so
 * stepping Back (or closing and reopening much later) restores it. Keeping it
 * open-shaped here avoids a schema change every time a step gains a field; the
 * wizard still parses the values it reads.
 */
export const ReviewDraftSchema = z.object({
  weekOf: WeekKeySchema,
  step: z.number().int().min(0).max(REVIEW_STEP_COUNT - 1),
  decisions: z.record(z.unknown()).default({}),
  updatedAt: z.date(),
});
export type ReviewDraft = z.infer<typeof ReviewDraftSchema>;

export const ReviewInputSchema = ReviewSchema.omit({ createdAt: true, updatedAt: true });
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
export const ReviewDraftInputSchema = ReviewDraftSchema.omit({ updatedAt: true });
export type ReviewDraftInput = z.infer<typeof ReviewDraftInputSchema>;

/** Fields a caller may set when saving a review; omitted ones keep their value. */
export type ReviewPatch = { notes?: string; statsSnapshot?: WeeklyStats };
