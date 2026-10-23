/**
 * Settings resolution for planning (roadmap W6 part 1 known gap).
 *
 * Both fields are optional on the settings row so old rows keep parsing; every
 * planning caller must go through these helpers instead of reading
 * `settings.wakingHours ?? …` ad hoc, so capacity never falls back implicitly.
 */

import {
  DEFAULT_SETTINGS,
  AnchorSchema,
  WakingHoursSchema,
  type Anchor,
  type Settings,
  type WakingHours,
} from '@/lib/schemas/settings';

/** The documented default: awake 07:00–22:00. */
export const DEFAULT_WAKING_HOURS: WakingHours = {
  start: '07:00',
  end: '22:00',
};

/** Waking hours with the default applied; invalid values fall back to the default. */
export function resolveWakingHours(settings: Settings | null | undefined): WakingHours {
  const candidate = settings?.wakingHours;
  const parsed = WakingHoursSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_WAKING_HOURS;
}

/**
 * Anchors with the default applied. Rows that fail validation are dropped
 * rather than crashing planning; the settings UI can only write valid ones.
 */
export function resolveAnchors(settings: Settings | null | undefined): Anchor[] {
  const candidate = settings?.anchors;
  if (!Array.isArray(candidate)) return [];
  const anchors: Anchor[] = [];
  for (const row of candidate) {
    const parsed = AnchorSchema.safeParse(row);
    if (parsed.success) anchors.push(parsed.data);
  }
  return anchors;
}

/** True when the settings row still carries the defaults (used by tests/docs). */
export function usesDefaultWakingHours(settings: Settings | null | undefined): boolean {
  const resolved = resolveWakingHours(settings);
  return (
    resolved.start === DEFAULT_SETTINGS.wakingHours!.start &&
    resolved.end === DEFAULT_SETTINGS.wakingHours!.end
  );
}
