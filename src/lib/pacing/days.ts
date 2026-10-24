/**
 * Pure local-day-key arithmetic for the pacing engine.
 *
 * Day keys are local YYYY-MM-DD strings (see `toLocalDateString`). This
 * module never reads the clock: caller-provided keys are converted through
 * `Date.UTC`, so results are timezone-independent and deterministic.
 */

const DAY_MS = 86_400_000;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDayKey(dayKey: string): { readonly y: number; readonly m: number; readonly d: number } {
  const [y, m, d] = DAY_KEY_PATTERN.exec(dayKey)?.slice(1).map(Number) ?? [];
  if (y == null || m == null || d == null) {
    throw new Error(`Invalid day key "${dayKey}"; expected YYYY-MM-DD`);
  }
  return { y, m, d };
}

/** Shift a local day key by `days` calendar days (month/year/leap-safe). */
export function addDays(dayKey: string, days: number): string {
  const { y, m, d } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Whole local calendar days from `earlier` to `later` (negative when `later`
 * is the earlier key).
 *
 * This is calendar arithmetic, not elapsed time: a spring-forward day is still
 * one day, so "untouched for 14 days" means 14 line items on the calendar, not
 * 14 × 86,400,000 milliseconds.
 */
export function daysBetweenDayKeys(earlier: string, later: string): number {
  const { y: ey, m: em, d: ed } = parseDayKey(earlier);
  const { y: ly, m: lm, d: ld } = parseDayKey(later);
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / DAY_MS);
}

/** True when `value` is an existing calendar date written as YYYY-MM-DD. */
export function isDayKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
