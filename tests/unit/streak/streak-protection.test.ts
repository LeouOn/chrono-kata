import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/lib/streak/compute-streak';
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';

function createSession(dateStr: string, minutes = 20): Session {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    id: crypto.randomUUID(),
    startedAt: d,
    endedAt: new Date(d.getTime() + minutes * 60000),
    durationMinutes: minutes,
    rating: 4,
    createdAt: d,
    updatedAt: d,
  };
}

const INITIAL_STREAK: Streak = {
  id: 'singleton',
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastSessionDate: '1970-01-01',
  milestonesAchieved: [],
  updatedAt: new Date(),
};

describe('Streak Protection & Rest Days', () => {
  it('preserves streak when practicing consecutive days without rest days', () => {
    const now = new Date('2026-08-19T12:00:00'); // Wednesday
    const sessions = [
      createSession('2026-08-19'),
      createSession('2026-08-18'),
      createSession('2026-08-17'),
    ];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
    });

    expect(result.currentStreakDays).toBe(3);
    expect(result.longestStreakDays).toBe(3);
  });

  it('exempts configured weekend rest days from breaking the streak', () => {
    // 2026-08-17 is Monday
    // 2026-08-16 is Sunday (Rest Day)
    // 2026-08-15 is Saturday (Rest Day)
    // 2026-08-14 is Friday (Practice)
    // 2026-08-13 is Thursday (Practice)
    const now = new Date('2026-08-17T12:00:00');
    const sessions = [
      createSession('2026-08-17'),
      createSession('2026-08-14'),
      createSession('2026-08-13'),
    ];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      restDays: ['sat', 'sun'],
    });

    expect(result.currentStreakDays).toBe(3);
  });

  it('uses a streak freeze token on an unplanned missed day to save the streak', () => {
    // Wednesday (now), Tuesday (missed), Monday (practice), Sunday (practice)
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [
      createSession('2026-08-19'),
      createSession('2026-08-17'),
      createSession('2026-08-16'),
    ];

    const resultWithFreeze = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      streakFreezeTokens: 1,
    });

    expect(resultWithFreeze.currentStreakDays).toBe(3);

    // Without freeze token, the streak would stop at Wednesday (1 day)
    const resultWithoutFreeze = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      streakFreezeTokens: 0,
    });

    expect(resultWithoutFreeze.currentStreakDays).toBe(1);
  });
});
