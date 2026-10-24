/**
 * "Untouched for N days": the one definition the planner and the weekly review
 * share, so Wave 10 (project stalls) and Wave 11 (tasks that are "waiting")
 * cannot disagree about what a day is.
 *
 * Days are LOCAL CALENDAR days, never 24-hour spans of elapsed time. Something
 * touched at 23:59 and looked at again at 00:01 two weeks later is fourteen
 * days untouched, and a DST change that makes a day 23 or 25 hours long does
 * not move the answer by a day. The day of the touch is day 0.
 *
 * Which timestamp feeds this is each caller's choice (`Task.touchedAt` for a
 * task, a project's last real work for a project); this module only does the
 * arithmetic.
 */

import { daysBetweenDayKeys } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';

/** A task untouched this many days is "waiting" (the weekly review's rule). */
export const WAITING_AFTER_DAYS = 14;

/**
 * Whole local days since `touchedAt`, never negative: a touch that is in the
 * future (a clock change, an imported row) counts as today. An unreadable date
 * counts as today too, so bad data stays quiet instead of nagging or throwing.
 */
export function daysUntouched(touchedAt: Date, now: Date): number {
  if (!Number.isFinite(touchedAt.getTime()) || !Number.isFinite(now.getTime())) return 0;
  return Math.max(0, daysBetweenDayKeys(toLocalDateString(touchedAt), toLocalDateString(now)));
}

/** True once `days` local days have passed since the touch. */
export function isUntouchedFor(touchedAt: Date, now: Date, days: number): boolean {
  return daysUntouched(touchedAt, now) >= days;
}
