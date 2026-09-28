/**
 * Daily training load: weighted load-minutes per local day.
 *
 * Load model (documented decision):
 * - A timed session contributes `durationMinutes x intensity`.
 * - A reps-only session contributes `reps x REP_MINUTES x intensity`:
 *   REP_MINUTES converts reps into duration-equivalent minutes first, then
 *   intensity scales the result exactly like any other session.
 * - Intensity comes from `sessionIntensity`, which matches the session's
 *   activityLabel to a kata template name and defaults to 1 (gentle).
 */

import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from './days';
import type { Intensity, LoadMap } from './types';

/** Load-minutes per rep for reps-only sessions: 50 reps = 5 load-minutes. */
export const REP_MINUTES = 0.1;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve a session's kata intensity by matching its activityLabel to a
 * template name (case- and whitespace-insensitively), defaulting to 1.
 * Kept as one seam so T8 can swap in a template-ID lookup.
 */
export function sessionIntensity(session: Session, templates: readonly KataTemplate[]): Intensity {
  if (session.activityLabel == null) return 1;
  const label = normalizeLabel(session.activityLabel);
  for (const t of templates) {
    if (normalizeLabel(t.name) === label) return t.intensity ?? 1;
  }
  return 1;
}

function sessionLoadMinutes(session: Session, templates: readonly KataTemplate[]): number {
  const baseMinutes = session.durationMinutes ?? (session.reps ?? 0) * REP_MINUTES;
  return baseMinutes * sessionIntensity(session, templates);
}

/** Sum of weighted load-minutes per local day, keyed YYYY-MM-DD. */
export function dailyLoad(sessions: readonly Session[], templates: readonly KataTemplate[]): LoadMap {
  const load = new Map<string, number>();
  for (const session of sessions) {
    const key = toLocalDateString(session.startedAt);
    load.set(key, (load.get(key) ?? 0) + sessionLoadMinutes(session, templates));
  }
  return load;
}

/** Total load over the `days` local days ending at `endDate` (inclusive). */
export function rollingLoad(daily: LoadMap, endDate: string, days: number): number {
  if (days <= 0) return 0;
  let total = 0;
  for (let offset = 0; offset < days; offset++) {
    total += daily.get(addDays(endDate, -offset)) ?? 0;
  }
  return total;
}
