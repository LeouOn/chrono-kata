import { describe, it, expect } from 'vitest';
import { buildActivityBreakdown } from '@/lib/insights/breakdown';
import type { Session } from '@/lib/schemas/session';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

describe('buildActivityBreakdown', () => {
  it('groups sessions by activityLabel, sums minutes + reps + counts', () => {
    const sessions = [
      ses({ durationMinutes: 30, reps: null, activityLabel: 'meditation' }),
      ses({ durationMinutes: 20, reps: null, activityLabel: 'meditation' }),
      ses({ durationMinutes: null, reps: 108, activityLabel: 'mantras' }),
      ses({ durationMinutes: null, reps: 50, activityLabel: 'push-ups' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result).toHaveLength(3);
    const med = result.find((r) => r.label === 'meditation')!;
    expect(med.totalMinutes).toBe(50);
    expect(med.totalReps).toBe(0);
    expect(med.sessionCount).toBe(2);
  });

  it('groups unlabeled sessions under "(unlabeled)"', () => {
    const sessions = [
      ses({ durationMinutes: 30, reps: null }),
      ses({ durationMinutes: 20, reps: null, activityLabel: 'meditation' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.label === '(unlabeled)')!.sessionCount).toBe(1);
  });

  it('sorts by total time desc (minutes-first, then reps)', () => {
    const sessions = [
      ses({ durationMinutes: 60, reps: null, activityLabel: 'a' }),
      ses({ durationMinutes: null, reps: 1000, activityLabel: 'b' }),
      ses({ durationMinutes: 30, reps: null, activityLabel: 'c' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result[0]!.label).toBe('a'); // 60m
    expect(result[1]!.label).toBe('c'); // 30m
    expect(result[2]!.label).toBe('b'); // reps sort after timed
  });

  it('returns empty array for no sessions', () => {
    expect(buildActivityBreakdown([])).toEqual([]);
  });
});
