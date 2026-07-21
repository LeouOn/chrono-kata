import { describe, it, expect } from 'vitest';
import { buildRatingTrend } from '@/lib/insights/trends';
import type { Session } from '@/lib/schemas/session';

const ses = (date: string, rating: number): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date(date),
  durationMinutes: 30,
  reps: null,
  rating,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Session);

describe('buildRatingTrend', () => {
  it('returns 30 days of data with rolling averages', () => {
    const sessions = [
      ses('2026-07-21T10:00:00Z', 5),
      ses('2026-07-20T10:00:00Z', 3),
      ses('2026-07-19T10:00:00Z', 4),
    ];
    const result = buildRatingTrend(sessions, new Date('2026-07-21T23:59:59Z'));
    expect(result).toHaveLength(30);
    const today = result[29]!;
    expect(today.averageRating).toBe(5);
    expect(today.sessionCount).toBe(1);
  });

  it('returns null averageRating for days with no sessions', () => {
    const result = buildRatingTrend([], new Date('2026-07-21T23:59:59Z'));
    expect(result).toHaveLength(30);
    expect(result[29]!.averageRating).toBeNull();
  });

  it('averages multiple sessions same day', () => {
    const sessions = [
      ses('2026-07-21T10:00:00Z', 4),
      ses('2026-07-21T14:00:00Z', 2),
    ];
    const result = buildRatingTrend(sessions, new Date('2026-07-21T23:59:59Z'));
    expect(result[29]!.averageRating).toBe(3);
    expect(result[29]!.sessionCount).toBe(2);
  });
});
