/**
 * Local wall-clock time, without a date library.
 *
 * A "local day key" is `YYYY-MM-DD` in the device's timezone (see
 * `toLocalDateString`). A "wall-clock time" is `HH:MM` on that day. This
 * module converts between the two and the absolute timeline, and it is where
 * the daylight-saving policy lives.
 *
 * ## Daylight saving policy
 *
 * **A time that does not exist** (the clock jumps forward, e.g. 02:30 on a
 * spring-forward morning) resolves **forward by the gap**: 02:30 becomes the
 * instant that is 03:30 local. That is the same choice calendars make for a
 * meeting that starts inside the gap.
 *
 * **A time that happens twice** (the clock falls back, e.g. 01:30 on a
 * fall-back morning) resolves to the **first** of the two occurrences, so the
 * earlier instant is always chosen and nothing is scheduled twice.
 *
 * Both choices are decided by looking at the two candidate offsets around the
 * requested time and asking which of them actually reproduces the wall clock.
 */

import { addDays } from '@/lib/pacing/days';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface DayKeyParts {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

export function parseDayKey(dayKey: string): DayKeyParts {
  const parts = DAY_KEY_PATTERN.exec(dayKey)?.slice(1).map(Number) ?? [];
  const [y, m, d] = parts;
  if (y == null || m == null || d == null) {
    throw new Error(`Invalid day key "${dayKey}"; expected YYYY-MM-DD`);
  }
  return { y, m, d };
}

export function parseClockTime(clock: string): { readonly hh: number; readonly mm: number } {
  const parts = CLOCK_PATTERN.exec(clock)?.slice(1).map(Number) ?? [];
  const [hh, mm] = parts;
  if (hh == null || mm == null) {
    throw new Error(`Invalid clock time "${clock}"; expected HH:MM`);
  }
  return { hh, mm };
}

/** The weekday of a local day key: 0 = Sunday … 6 = Saturday. */
export function localWeekday(dayKey: string): number {
  const { y, m, d } = parseDayKey(dayKey);
  // A calendar date has the same weekday everywhere, so this is computed in
  // UTC on purpose.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minutes west of UTC at a given instant (the same sign as Date#getTimezoneOffset). */
function offsetMinutesAt(epochMs: number): number {
  return new Date(epochMs).getTimezoneOffset();
}

/** The local wall clock of an instant: day key and HH:MM. */
export function epochToLocalClock(epochMs: number): { readonly dayKey: string; readonly clock: string } {
  const date = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dayKey: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/**
 * The instant of a local wall-clock time.
 *
 * See the daylight-saving policy at the top of this file.
 */
export function localWallClockToEpoch(dayKey: string, clock: string): number {
  const { y, m, d } = parseDayKey(dayKey);
  const { hh, mm } = parseClockTime(clock);
  const wallUtcGuess = Date.UTC(y, m - 1, d, hh, mm);

  // The two offsets that could apply: the one in effect before the requested
  // time and the one after it. They differ only around a transition.
  const offsetBefore = offsetMinutesAt(wallUtcGuess - 12 * HOUR_MS);
  const offsetAfter = offsetMinutesAt(wallUtcGuess + 12 * HOUR_MS);
  // `getTimezoneOffset` is minutes west of UTC, so the wall clock sits that
  // many minutes *behind* the UTC guess.
  const candidateBefore = wallUtcGuess + offsetBefore * MINUTE_MS;
  const candidateAfter = wallUtcGuess + offsetAfter * MINUTE_MS;

  if (offsetBefore === offsetAfter) return candidateBefore;

  const reproduces = (epochMs: number) => {
    const local = epochToLocalClock(epochMs);
    return local.dayKey === dayKey && local.clock === clock;
  };

  const beforeWorks = reproduces(candidateBefore);
  const afterWorks = reproduces(candidateAfter);

  // The time happens twice: take the first occurrence.
  if (beforeWorks && afterWorks) return Math.min(candidateBefore, candidateAfter);
  // The time happens once: take it.
  if (beforeWorks) return candidateBefore;
  if (afterWorks) return candidateAfter;
  // The time does not exist: shift forward by the gap, which is the later of
  // the two candidates (the earlier one lands before the requested clock).
  return Math.max(candidateBefore, candidateAfter);
}

/** The instant of local midnight that starts a day. */
export function localDayStart(dayKey: string): number {
  return localWallClockToEpoch(dayKey, '00:00');
}

/** The instant of local midnight that ends a day (the start of the next). */
export function localDayEnd(dayKey: string): number {
  return localWallClockToEpoch(addDays(dayKey, 1), '00:00');
}

/** Whole minutes between two instants, never negative. */
export function elapsedMinutes(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / MINUTE_MS));
}

/**
 * The day's waking window as absolute instants.
 *
 * The window belongs to the day it starts on, so an overnight window
 * (`end` at or before `start`) ends on the next morning.
 */
export function wakingWindow(
  dayKey: string,
  wakingHours: { readonly start: string; readonly end: string },
): { readonly start: number; readonly end: number } {
  const start = localWallClockToEpoch(dayKey, wakingHours.start);
  const { hh: startH, mm: startM } = parseClockTime(wakingHours.start);
  const { hh: endH, mm: endM } = parseClockTime(wakingHours.end);
  const endsLater = endH * 60 + endM > startH * 60 + startM;
  const endDay = endsLater ? dayKey : addDays(dayKey, 1);
  const end = localWallClockToEpoch(endDay, wakingHours.end);
  return { start, end };
}
