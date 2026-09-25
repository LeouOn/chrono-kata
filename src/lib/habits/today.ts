import type { Habit, HabitLog } from '@/lib/schemas/habit';
import { toLocalDateString } from '@/lib/utils/date';
import { isScheduledOn } from './schedule';

export const TODAY_HABITS_ENABLED = true;

export function shiftLocalDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

export function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function formatShortDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinuteAmount(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} min`;
}

export function activeHabits(habits: Habit[]): Habit[] {
  return habits
    .filter((habit) => habit.archivedAt == null)
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function scheduledHabits(habits: Habit[], date: string): Habit[] {
  return activeHabits(habits).filter((habit) => isScheduledOn(habit, date));
}

export function manualMinutes(logs: HabitLog[]): number {
  return logs.reduce((sum, log) => (log.source === 'manual' ? sum + (log.minutes ?? 0) : sum), 0);
}

export function loggedMinutes(logs: HabitLog[]): number {
  return logs.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
}

export function loggedCount(logs: HabitLog[]): number {
  return logs.reduce((sum, log) => sum + (log.delta ?? 0), 0);
}

export function latestLogDate(logs: HabitLog[]): string | null {
  let latest: string | null = null;
  for (const log of logs) {
    if (latest == null || log.date > latest) latest = log.date;
  }
  return latest;
}
