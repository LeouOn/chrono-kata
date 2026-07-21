import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  totalMinutes: number;
  sessionCount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  maxMinutes: number;
}

/**
 * Build year-in-pixels data. Returns one cell per day of the given year,
 * ordered January 1 → December 31. Days with no sessions have intensity 0.
 */
export function buildHeatmapData(sessions: Session[], year: number): HeatmapData {
  // Bucket sessions by local date string.
  const byDay = new Map<string, { minutes: number; count: number }>();
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const existing = byDay.get(key);
    if (existing) {
      existing.minutes += s.durationMinutes ?? 0;
      existing.count += 1;
    } else {
      byDay.set(key, { minutes: s.durationMinutes ?? 0, count: 1 });
    }
  }

  // Build full-year list.
  const cells: HeatmapCell[] = [];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const start = new Date(year, 0, 1);
  let maxMinutes = 0;

  for (let i = 0; i < daysInYear; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = toLocalDateString(d);
    const entry = byDay.get(key);
    const totalMinutes = entry?.minutes ?? 0;
    const sessionCount = entry?.count ?? 0;
    if (totalMinutes > maxMinutes) maxMinutes = totalMinutes;
    cells.push({ date: key, totalMinutes, sessionCount, intensity: 0 });
  }

  // Assign intensity 0-4 based on max minutes in year.
  for (const c of cells) {
    if (c.totalMinutes === 0 || maxMinutes === 0) {
      c.intensity = 0;
    } else {
      const ratio = c.totalMinutes / maxMinutes;
      c.intensity = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    }
  }

  return { cells, maxMinutes };
}
