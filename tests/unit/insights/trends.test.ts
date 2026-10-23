import { describe, it, expect } from 'vitest';
import { buildRatingTrend } from '@/lib/insights/trends';
import type { Session } from '@/lib/schemas/session';

// Local-calendar instants so every timestamp keeps the same local date key
// in any runner timezone (ground rules: local YYYY-MM-DD date keys).
const ses = (startedAt: Date, rating: number): Session => ({
  id: crypto.randomUUID(),
  startedAt,
  durationMinutes: 30,
  reps: null,
  rating,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Session);

describe('buildRatingTrend', () => {
  it('returns 30 days of data with rolling averages', () => {
    const sessions = [
      ses(new Date(2026, 6, 21, 10), 5),
      ses(new Date(2026, 6, 20, 10), 3),
      ses(new Date(2026, 6, 19, 10), 4),
    ];
    const result = buildRatingTrend(sessions, new Date(2026, 6, 21, 23, 59, 59));
    expect(result).toHaveLength(30);
    const today = result[29]!;
    expect(today.date).toBe('2026-07-21');
    expect(today.averageRating).toBe(5);
    expect(today.sessionCount).toBe(1);
  });

  it('returns null averageRating for days with no sessions', () => {
    const result = buildRatingTrend([], new Date(2026, 6, 21, 23, 59, 59));
    expect(result).toHaveLength(30);
    expect(result[29]!.averageRating).toBeNull();
  });

  it('averages multiple sessions same day', () => {
    const sessions = [
      ses(new Date(2026, 6, 21, 10), 4),
      ses(new Date(2026, 6, 21, 14), 2),
    ];
    const result = buildRatingTrend(sessions, new Date(2026, 6, 21, 23, 59, 59));
    expect(result[29]!.date).toBe('2026-07-21');
    expect(result[29]!.averageRating).toBe(3);
    expect(result[29]!.sessionCount).toBe(2);
  });
});
