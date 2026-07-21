import { z } from 'zod';

export const COACH_PERSONALITIES = ['zen', 'hype', 'analyst', 'buddy', 'athena'] as const;
export const CoachPersonalitySchema = z.enum(COACH_PERSONALITIES);
export type CoachPersonality = z.infer<typeof CoachPersonalitySchema>;

export const STANDARD_COACH_PERSONALITIES: CoachPersonality[] = ['zen', 'hype', 'analyst', 'buddy'];
