import { z } from 'zod';
import { DECOMPOSITION_FEATURE } from '@/lib/decomposition/schema';
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
  /** Task capture, inbox and triage (roadmap W2, preview). */
  'taskInbox',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

export const FlagsSchema = z.object({
  privateMode: z.boolean(),
  nativeCalendar: z.boolean(),
  nudgeKinds: z.boolean(),
  sync: z.boolean(),
  taskInbox: z.boolean(),
});
export type Flags = z.infer<typeof FlagsSchema>;
/** The stored shape: any subset of the flags, each one a boolean. */
export type FlagValues = Partial<Flags>;

/**
 * The AI surfaces that can be routed to a different provider (roadmap W5).
 *
 * `decomposition` and `estimate` are reserved for roadmap W3 and W4 — they
 * exist as named slots now so the routing table does not have to change
 * shape when those waves land.
 */
export const LLM_FEATURES = [
  'dailyBriefing',
  'sessionCoachComment',
  'weeklyReflection',
  'conversationReply',
  'labelSuggestion',
  DECOMPOSITION_FEATURE,
  'estimate',
] as const;
export type LLMFeature = (typeof LLM_FEATURES)[number];

/**
 * Which provider each AI surface uses.
 *
 * `default` is the fallback for every feature that has no explicit entry;
 * `features` overrides it per surface. Both name a provider configured in
 * LLM settings. Stored on the settings row, optional and non-indexed, so no
 * Dexie version is needed.
 */
export const LLMRoutingSchema = z.object({
  /** Provider used by any feature without its own entry. */
  default: z.string().min(1).optional(),
  /** Per-feature provider overrides. */
  features: z.record(z.enum(LLM_FEATURES), z.string().min(1)).optional(),
});
export type LLMRouting = z.infer<typeof LLMRoutingSchema>;

/** A wall-clock time, HH:MM in the device's timezone. */
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour.');
export type ClockTime = z.infer<typeof ClockTimeSchema>;

/**
 * The hours you are awake.
 *
 * The window belongs to the day it **starts** on: `22:00`–`07:00` means the
 * window runs from 22:00 on that day until 07:00 the next morning, so the
 * minutes after midnight count towards the day the window began.
 */
export const WakingHoursSchema = z.object({
  start: ClockTimeSchema,
  end: ClockTimeSchema,
});
export type WakingHours = z.infer<typeof WakingHoursSchema>;

/**
 * A recurring protected window (roadmap Wave 6 "anchors").
 *
 * The anchor belongs to the weekday it **starts** on, and `end` may be at or
 * before `start`, which makes it cross midnight.
 */
export const AnchorSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  /** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: ClockTimeSchema,
  end: ClockTimeSchema,
  /** The domain this window belongs to; other domains are kept out of it. */
  domainId: z.string().uuid().nullable().optional(),
});
export type Anchor = z.infer<typeof AnchorSchema>;

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
  /** Per-feature provider routing. Absent on rows written before routing existed. */
  llmRouting: LLMRoutingSchema.optional(),
  /** The hours you are awake. Absent on rows written before planning existed. */
  wakingHours: WakingHoursSchema.optional(),
  /** Recurring protected windows. Absent on rows written before planning existed. */
  anchors: z.array(AnchorSchema).optional(),
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
  wakingHours: { start: '07:00', end: '22:00' },
  anchors: [],
};
