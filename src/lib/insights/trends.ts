import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface RatingTrendDay {
  date: string; // YYYY-MM-DD
  averageRating: number | null;
  sessionCount: number;
}

/**
 * Returns 30 days of rating data ending at `endDate`. Each entry shows the
 * average rating for that day, or null if no sessions.
 */
export function buildRatingTrend(sessions: Session[], endDate: Date): RatingTrendDay[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const entry = byDay.get(key);
    if (entry) {
      entry.sum += s.rating;
      entry.count += 1;
    } else {
      byDay.set(key, { sum: s.rating, count: 1 });
    }
  }

  const days: RatingTrendDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const key = toLocalDateString(d);
    const entry = byDay.get(key);
    days.push({
      date: key,
      averageRating: entry ? entry.sum / entry.count : null,
      sessionCount: entry?.count ?? 0,
    });
  }
  return days;
}
