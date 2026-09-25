import { z } from 'zod';

/**
 * Morning check-in: how the user feels the day after, one row per local day.
 *
 * Every scale is 1–5, but the direction differs per field, matching how people
 * naturally answer. The pacing engine (T3) normalizes them:
 *
 * | field  | 1          | 5          | direction       |
 * |--------|------------|------------|-----------------|
 * | energy | depleted   | energetic  | high is good    |
 * | fog    | clear      | heavy fog  | high is bad     |
 * | aches  | none       | severe     | high is bad     |
 * | sleep  | poor       | restful    | high is good    |
 */
export const CheckInScaleSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type CheckInScale = z.infer<typeof CheckInScaleSchema>;

export const CheckInSchema = z.object({
  /** Local calendar day, YYYY-MM-DD. Primary key: one check-in per day. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 1 = depleted, 5 = energetic. High is good. */
  energy: CheckInScaleSchema,
  /** 1 = clear, 5 = heavy fog. High is bad. */
  fog: CheckInScaleSchema,
  /** 1 = none, 5 = severe. High is bad. */
  aches: CheckInScaleSchema,
  /** 1 = poor, 5 = restful. High is good. */
  sleep: CheckInScaleSchema,
  note: z.string().max(500).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CheckIn = z.infer<typeof CheckInSchema>;

export const CheckInInputSchema = CheckInSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export type CheckInInput = z.infer<typeof CheckInInputSchema>;
