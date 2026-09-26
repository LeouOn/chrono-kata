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
