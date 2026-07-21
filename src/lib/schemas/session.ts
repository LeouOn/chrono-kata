import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const RatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type Rating = z.infer<typeof RatingSchema>;

export const MultiDimRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type MultiDimRating = z.infer<typeof MultiDimRatingSchema>;

const SessionBaseSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.date(),
  endedAt: z.date().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  reps: z.number().int().positive().nullable().optional(),
  rating: RatingSchema,
  activityLabel: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
  coachComment: z.string().nullable().optional(),
  coachPersonalityAtGeneration: CoachPersonalitySchema.optional(),
  failedLLM: z.boolean().optional(),
  calendarEventId: z.string().nullable().optional(),
  focusRating: MultiDimRatingSchema.nullable().optional(),
  energyRating: MultiDimRatingSchema.nullable().optional(),
  moodRating: MultiDimRatingSchema.nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SessionSchema = SessionBaseSchema.refine(
  (s) => (s.durationMinutes != null) !== (s.reps != null),
  { message: 'Exactly one of durationMinutes or reps must be set (not both, not neither).' }
);

export type Session = z.infer<typeof SessionSchema>;

export const SessionInputSchema = SessionBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  coachComment: true,
  coachPersonalityAtGeneration: true,
  failedLLM: true,
  calendarEventId: true,
});
export type SessionInput = z.infer<typeof SessionInputSchema>;