import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 (Sun) to 6 (Sat)
  totalMinutes: number;
  totalReps: number;
  sessionCount: number;
  intensity: HeatmapIntensity;
  dominantActivity?: string;
}

export interface YearlyMatrixResult {
  year: number;
  weeks: HeatmapDay[][];
  totalPracticedDays: number;
  totalMinutesInYear: number;
  totalSessionsInYear: number;
}

/**
 * Calculates intensity level (0-4) based on practice duration/reps.
 */
export function calculateIntensity(minutes: number, reps: number): HeatmapIntensity {
  if (minutes <= 0 && reps <= 0) return 0;
  if (minutes >= 60 || reps >= 100) return 4;
  if (minutes >= 30 || reps >= 50) return 3;
  if (minutes >= 15 || reps >= 25) return 2;
  return 1;
}

/**
 * Builds a 52-53 week matrix for the entire calendar year (Jan 1 to Dec 31).
 */
export function buildYearlyConsistencyMatrix(
  sessions: Session[],
  targetYear?: number
): YearlyMatrixResult {
  const year = targetYear ?? new Date().getFullYear();

  // Aggregate sessions by local date string
  const dayStats = new Map<
    string,
    { minutes: number; reps: number; count: number; activities: Map<string, number> }
  >();

  for (const s of sessions) {
    if (s.startedAt.getFullYear() !== year) continue;
    const key = toLocalDateString(s.startedAt);
    if (!dayStats.has(key)) {
      dayStats.set(key, { minutes: 0, reps: 0, count: 0, activities: new Map() });
    }
    const current = dayStats.get(key)!;
    current.minutes += s.durationMinutes ?? 0;
    current.reps += s.reps ?? 0;
    current.count += 1;
    if (s.activityLabel) {
      const actCount = current.activities.get(s.activityLabel) ?? 0;
      current.activities.set(s.activityLabel, actCount + 1);
    }
  }

  // Calendar boundaries
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Align start to the preceding Sunday to build complete 7-day columns
  const firstGridDate = new Date(startDate);
  firstGridDate.setDate(firstGridDate.getDate() - firstGridDate.getDay());

  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];
  const cursor = new Date(firstGridDate);

  let totalPracticedDays = 0;
  let totalMinutesInYear = 0;
  let totalSessionsInYear = 0;

  while (cursor <= endDate || currentWeek.length > 0) {
    const key = toLocalDateString(cursor);
    const inTargetYear = cursor.getFullYear() === year;
    const stats = inTargetYear ? dayStats.get(key) : undefined;

    let dominantActivity: string | undefined;
    if (stats && stats.activities.size > 0) {
      dominantActivity = Array.from(stats.activities.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];
    }

    const minutes = stats?.minutes ?? 0;
    const reps = stats?.reps ?? 0;
    const count = stats?.count ?? 0;

    if (inTargetYear && (minutes > 0 || reps > 0 || count > 0)) {
      totalPracticedDays += 1;
      totalMinutesInYear += minutes;
      totalSessionsInYear += count;
    }

    currentWeek.push({
      date: key,
      dayOfWeek: cursor.getDay(),
      totalMinutes: minutes,
      totalReps: reps,
      sessionCount: count,
      intensity: inTargetYear ? calculateIntensity(minutes, reps) : 0,
      dominantActivity,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
      if (cursor > endDate) break;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    year,
    weeks,
    totalPracticedDays,
    totalMinutesInYear,
    totalSessionsInYear,
  };
}

export interface MonthlySummary {
  /** Local month key, e.g. 2026-06. */
  month: string;
  sessions: number;
  minutes: number;
  activeDays: number;
}

export interface YearSummary {
  /** Sessions with any minutes or reps in the year. */
  sessions: number;
  activeDays: number;
  minutes: number;
  /** The month with the most minutes, or null for a year with no practice. */
  busiest: MonthlySummary | null;
  months: MonthlySummary[];
}

/**
 * A text summary of a year matrix, so the 371 grid cells are not the only way to
 * read the year (roadmap Wave 19: a dense visualisation needs a text
 * alternative). Pure; months are local calendar months from the day keys.
 */
export function summariseYearMatrix(matrix: YearlyMatrixResult): YearSummary {
  const byMonth = new Map<string, MonthlySummary>();
  for (const week of matrix.weeks) {
    for (const day of week) {
      const month = day.date.slice(0, 7);
      // The first grid week can start in the previous December; that day is not
      // part of this year's story (and never carries practice from this year).
      if (!month.startsWith(`${matrix.year}-`)) continue;
      const entry = byMonth.get(month) ?? { month, sessions: 0, minutes: 0, activeDays: 0 };
      entry.sessions += day.sessionCount;
      entry.minutes += day.totalMinutes;
      if (day.sessionCount > 0 || day.totalMinutes > 0) entry.activeDays += 1;
      byMonth.set(month, entry);
    }
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  let busiest: MonthlySummary | null = null;
  for (const month of months) {
    if (month.minutes <= 0) continue;
    // Ties go to the earlier month, so the answer is stable.
    if (!busiest || month.minutes > busiest.minutes) busiest = month;
  }
  return {
    sessions: matrix.totalSessionsInYear,
    activeDays: matrix.totalPracticedDays,
    minutes: matrix.totalMinutesInYear,
    busiest,
    months,
  };
}
