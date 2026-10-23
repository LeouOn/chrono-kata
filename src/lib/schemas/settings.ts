import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const AccentColorSchema = z.enum(['amber', 'sage', 'magenta', 'cyan']);
export type AccentColor = z.infer<typeof AccentColorSchema>;

export const RatingStyleSchema = z.enum(['stars', 'slider', 'emoji', 'dots']);
export type RatingStyle = z.infer<typeof RatingStyleSchema>;

export const DayOfWeekSchema = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

/**
 * Feature flags for roadmap work that is experimental until it is proven.
 *
 * Flags live on the singleton settings row as one optional, non-indexed field,
 * so no Dexie version is needed and a row written before flags existed stays
 * valid (it simply has no flags).
 *
 * The flag names are a closed union: `FLAG_NAMES` is the only source of truth
 * and `FlagName` is derived from it, so a typo fails the typecheck instead of
 * silently shipping a flag nobody reads.
 */
export const FLAG_NAMES = [
  /** Private mode: every AI call stays on a local provider (roadmap W5). */
  'privateMode',
  /** Native Android calendar integration; ICS stays the local-first path (roadmap W8). */
  'nativeCalendar',
  /** The opt-in nudge kinds beyond today's single daily reminder (roadmap W16). */
  'nudgeKinds',
  /** Optional device sync between devices (roadmap W18). */
  'sync',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

export const FlagsSchema = z.object({
  privateMode: z.boolean(),
  nativeCalendar: z.boolean(),
  nudgeKinds: z.boolean(),
  sync: z.boolean(),
});
export type Flags = z.infer<typeof FlagsSchema>;
/** The stored shape: any subset of the flags, each one a boolean. */
export type FlagValues = Partial<Flags>;

/** Check-in energy at or below this counts as a low-energy rest day. */
export const LowEnergyRestThresholdSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type LowEnergyRestThreshold = z.infer<typeof LowEnergyRestThresholdSchema>;

/** Default low-energy threshold; matches the pacing engine's rest floor. */
export const DEFAULT_LOW_ENERGY_REST_THRESHOLD: LowEnergyRestThreshold = 2;

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
  confirmKataDelete: z.boolean().optional(),
  confirmSessionDelete: z.boolean().optional(),
  confirmClearData: z.boolean().optional(),
  showMorningCheckIn: z.boolean().optional(),
  habitLinksMigrated: z.boolean().optional(),
  dailyGoalMinutes: z.number().int().min(1).max(1440).optional(),
  weeklyGoalDays: z.number().int().min(1).max(7).optional(),
  restDays: z.array(DayOfWeekSchema).optional(),
  streakFreezeTokens: z.number().int().min(0).max(5).optional(),
  lastStreakFreezeUsedAt: z.date().nullable().optional(),
  recoveryMode: z.boolean().optional(),
  lowEnergyRestThreshold: LowEnergyRestThresholdSchema.optional(),
  /** Feature flags for experimental roadmap work. Absent on rows written before flags existed. */
  flags: FlagsSchema.partial().optional(),
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
  ratingStyle: 'stars',
  confirmKataDelete: true,
  confirmSessionDelete: true,
  confirmClearData: true,
  showMorningCheckIn: true,
  dailyGoalMinutes: 20,
  weeklyGoalDays: 5,
  restDays: [],
  streakFreezeTokens: 1,
  lastStreakFreezeUsedAt: null,
  recoveryMode: false,
  lowEnergyRestThreshold: DEFAULT_LOW_ENERGY_REST_THRESHOLD,
  flags: {},
};
