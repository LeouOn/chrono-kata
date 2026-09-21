import { z } from 'zod';

export const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

export const StreakSchema = z.object({
  id: z.literal('singleton'),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  lastSessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  milestonesAchieved: z.array(z.number().int().positive()),
  /** Local YYYY-MM-DD dates already covered by a spent streak-freeze token. */
  freezeUsedOn: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  updatedAt: z.date(),
});

export type Streak = z.infer<typeof StreakSchema>;
