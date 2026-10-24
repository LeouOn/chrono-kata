import { z } from 'zod';
import { addDays, isDayKey } from '@/lib/pacing/days';
import { localWallClockToEpoch, localWeekday } from '@/lib/planning/time';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * Week identity for the weekly review (roadmap Wave 11).
 *
 * A review week is named by the local Monday that starts it, written as the
 * local day key `YYYY-MM-DD` (`toLocalDateString`, never an ISO timestamp).
 * Everything here is pure string/calendar arithmetic; the only timezone-dependent
 * step is turning the two midnights into instants (`localWallClockToEpoch`),
 * which is where DST is handled.
 */

/**
 * A local Monday day key. This is the primary key of a review and its draft.
 *
 * One refinement, not a chain: zod runs every refinement on a schema, so a
 * second one would still execute `localWeekday` on a malformed key and throw
 * instead of reporting a validation error.
 */
export const WeekKeySchema = z
  .string()
  .refine(
    (key) => isDayKey(key) && localWeekday(key) === 1,
    'A review week is named by its local Monday day key (YYYY-MM-DD).',
  );

/** The Monday that starts the local week containing `dayKey`. */
export function mondayOf(dayKey: string): string {
  if (!isDayKey(dayKey)) throw new Error(`Invalid day key "${dayKey}"; expected YYYY-MM-DD`);
  // localWeekday is computed on bare calendar dates in UTC, so 0 = Sunday.
  const weekday = localWeekday(dayKey);
  return addDays(dayKey, -((weekday + 6) % 7));
}

/** The Monday of the local week that contains `date`. */
export function weekKeyFor(date: Date): string {
  return mondayOf(toLocalDateString(date));
}

/** The Monday of the week before `weekOf`. */
export function weekBefore(weekOf: string): string {
  return addDays(mondayOf(weekOf), -7);
}

/**
 * A short human label for the week, e.g. "15 June". Formatted in UTC from the
 * bare calendar date, so the label cannot drift a day with the device zone.
 */
export function formatWeekLabel(weekOf: string): string {
  const monday = mondayOf(weekOf);
  const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * The instants that bound the week: local midnight on its Monday and local
 * midnight on the next one. A DST week is 167 or 169 hours long, so callers
 * must compare instants against this range rather than adding 7 × 24 hours.
 * Any day key inside the week is accepted and normalised to that Monday.
 */
export function weekRange(weekOf: string): { start: number; end: number } {
  const monday = mondayOf(weekOf);
  return {
    start: localWallClockToEpoch(monday, '00:00'),
    end: localWallClockToEpoch(addDays(monday, 7), '00:00'),
  };
}
