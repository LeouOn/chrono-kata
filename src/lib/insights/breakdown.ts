import type { Session } from '@/lib/schemas/session';

export interface ActivityBreakdownEntry {
  label: string;
  totalMinutes: number;
  totalReps: number;
  sessionCount: number;
  averageRating: number;
}

export function buildActivityBreakdown(sessions: Session[]): ActivityBreakdownEntry[] {
  const map = new Map<string, { minutes: number; reps: number; count: number; ratingSum: number }>();
  for (const s of sessions) {
    const label = s.activityLabel ?? '(unlabeled)';
    const entry = map.get(label);
    if (entry) {
      entry.minutes += s.durationMinutes ?? 0;
      entry.reps += s.reps ?? 0;
      entry.count += 1;
      entry.ratingSum += s.rating;
    } else {
      map.set(label, {
        minutes: s.durationMinutes ?? 0,
        reps: s.reps ?? 0,
        count: 1,
        ratingSum: s.rating,
      });
    }
  }

  const entries: ActivityBreakdownEntry[] = Array.from(map.entries()).map(([label, e]) => ({
    label,
    totalMinutes: e.minutes,
    totalReps: e.reps,
    sessionCount: e.count,
    averageRating: e.ratingSum / e.count,
  }));

  // Timed activities first (by minutes desc), then reps-only (by reps desc).
  entries.sort((a, b) => {
    if (a.totalMinutes > 0 || b.totalMinutes > 0) {
      return b.totalMinutes - a.totalMinutes;
    }
    return b.totalReps - a.totalReps;
  });

  return entries;
}
