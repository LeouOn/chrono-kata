import { describe, it, expect } from 'vitest';
import { formatDuration, formatSessionSummary } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

describe('formatDuration', () => {
  it('formats minutes under 60 as "Xm"', () => {
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(5)).toBe('5m');
  });

  it('formats 60 minutes as "1h"', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats 90 minutes as "1h 30m"', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats 0 minutes as "0m"', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats fractional minutes without rounding', () => {
    expect(formatDuration(3.5)).toBe('3.5m');
    expect(formatDuration(63.5)).toBe('1h 3.5m');
  });
});

describe('formatSessionSummary', () => {
  const base = (overrides: Partial<Session>): Session => ({
    id: 'test',
    startedAt: new Date(2026, 6, 21, 10, 0),
    rating: 3,
    createdAt: new Date(2026, 6, 21, 10, 0),
    updatedAt: new Date(2026, 6, 21, 10, 0),
    ...overrides,
  } as Session);

  it('returns "30m · meditation" for a timed session with label', () => {
    expect(
      formatSessionSummary(
        base({ durationMinutes: 30, reps: null, activityLabel: 'meditation' })
      )
    ).toBe('30m · meditation');
  });

  it('returns "108 reps" for a reps session without label', () => {
    expect(
      formatSessionSummary(base({ durationMinutes: null, reps: 108 }))
    ).toBe('108 reps');
  });

  it('returns "30m" for a timed session without label', () => {
    expect(formatSessionSummary(base({ durationMinutes: 30, reps: null }))).toBe(
      '30m'
    );
  });

  it('returns "3.5m · Daily stretches" without rounding the duration', () => {
    expect(
      formatSessionSummary(
        base({ durationMinutes: 3.5, reps: null, activityLabel: 'Daily stretches' })
      )
    ).toBe('3.5m · Daily stretches');
  });
});
