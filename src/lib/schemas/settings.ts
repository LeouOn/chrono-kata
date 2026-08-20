import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const AccentColorSchema = z.enum(['amber', 'sage', 'magenta', 'cyan']);
export type AccentColor = z.infer<typeof AccentColorSchema>;

export const RatingStyleSchema = z.enum(['slider', 'emoji', 'dots']);
export type RatingStyle = z.infer<typeof RatingStyleSchema>;

export const DayOfWeekSchema = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

export const SettingsSchema = z.object({
  id: z.literal('singleton'),
  displayName: z.string().max(50).optional(),
  selectedCoachPersonality: CoachPersonalitySchema,
  unlockedPersonalities: z.array(CoachPersonalitySchema),
  googleCalendarId: z.string().nullable().optional(),
  googleCalendarSyncEnabled: z.boolean(),
  googleCalendarConnectedAt: z.date().nullable().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  theme: ThemeModeSchema.optional(),
  accentColor: AccentColorSchema.optional(),
  ratingStyle: RatingStyleSchema.optional(),
  dailyGoalMinutes: z.number().int().min(1).max(1440).optional(),
  weeklyGoalDays: z.number().int().min(1).max(7).optional(),
  restDays: z.array(DayOfWeekSchema).optional(),
  streakFreezeTokens: z.number().int().min(0).max(5).optional(),
  lastStreakFreezeUsedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'> = {
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: null,
  googleCalendarSyncEnabled: false,
  googleCalendarConnectedAt: null,
  reminderTime: null,
  notificationsEnabled: false,
  theme: 'system',
  accentColor: 'amber',
  ratingStyle: 'slider',
  dailyGoalMinutes: 20,
  weeklyGoalDays: 5,
  restDays: [],
  streakFreezeTokens: 1,
  lastStreakFreezeUsedAt: null,
};
