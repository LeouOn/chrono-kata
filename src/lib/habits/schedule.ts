import type { Habit, HabitLog } from '@/lib/schemas/habit';
import type { DayOfWeek } from '@/lib/schemas/settings';
import { toLocalDateString } from '@/lib/utils/date';

const DAY_NAMES: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dayOfWeekOf(dateStr: string): DayOfWeek {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES[new Date(y!, m! - 1, d!).getDay()]!;
}

/** True when the habit should be practised on the given local YYYY-MM-DD. */
export function isScheduledOn(habit: Habit, dateStr: string): boolean {
  if (habit.schedule.kind === 'daily') return true;
  return habit.schedule.days.includes(dayOfWeekOf(dateStr));
}

export interface HabitDayProgress {
  /** Total contributed on the day (minutes for timed, quantity for count, 1/0 for boolean). */
  value: number;
  /** Null for boolean habits (no numeric target). */
  target: number | null;
  complete: boolean;
}

/** Aggregate a habit's logs for a single date into completion state. */
export function dayProgress(habit: Habit, logsForDate: HabitLog[]): HabitDayProgress {
  if (habit.kind === 'boolean') {
    return { value: logsForDate.length > 0 ? 1 : 0, target: null, complete: logsForDate.length > 0 };
  }
  const value =
    habit.kind === 'timed'
      ? logsForDate.reduce((sum, l) => sum + (l.minutes ?? 0), 0)
      : logsForDate.reduce((sum, l) => sum + (l.delta ?? 0), 0);
  const target = habit.targetPerDay ?? 0;
  return { value, target, complete: value >= target };
}

export function isHabitDueToday(habit: Habit, now: Date = new Date()): boolean {
  return habit.archivedAt == null && isScheduledOn(habit, toLocalDateString(now));
}

/** Case-insensitive match between a habit link and a session activity label. */
export function labelMatches(linkedActivityLabel: string | null | undefined, activityLabel: string | null | undefined): boolean {
  if (!linkedActivityLabel || !activityLabel) return false;
  return linkedActivityLabel.trim().toLowerCase() === activityLabel.trim().toLowerCase();
}
