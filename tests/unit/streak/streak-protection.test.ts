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
  freezeUsedOn: [],
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

  it('persists freeze consumption and relocates it to the newest gap', () => {
    // Wed 8/19 (now), missed Tue 8/18, sessions 8/19 + 8/17 + 8/16
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [
      createSession('2026-08-19'),
      createSession('2026-08-17'),
      createSession('2026-08-16'),
    ];
    const first = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      streakFreezeTokens: 1,
    });
    expect(first.currentStreakDays).toBe(3);
    expect(first.freezeUsedOn).toEqual(['2026-08-18']);

    // Later: practices Fri 8/21 but missed Thu 8/20. The single token can no
    // longer protect 8/18 (a newer gap exists), so it moves to 8/20 and the
    // walk stops at 8/18: streak = 8/21 + 8/19.
    const second = computeStreak({
      sessions: [...sessions, createSession('2026-08-21')],
      previousStreak: first,
      now: new Date('2026-08-21T12:00:00'),
      streakFreezeTokens: 1,
    });
    expect(second.currentStreakDays).toBe(2);
    expect(second.freezeUsedOn).toEqual(['2026-08-20']);

    // Third run with unchanged inputs is stable.
    const third = computeStreak({
      sessions: [...sessions, createSession('2026-08-21')],
      previousStreak: second,
      now: new Date('2026-08-21T12:00:00'),
      streakFreezeTokens: 1,
    });
    expect(third.currentStreakDays).toBe(2);
    expect(third.freezeUsedOn).toEqual(['2026-08-20']);
  });

  it('produces a stable result in a single calculation after a refund', () => {
    // Reviewer repro: sessions Sept 1 + Sept 3, one freeze previously spent
    // on Sept 2, evaluated Sept 5. Must not return 0 then 1 on re-run.
    const sessions = [createSession('2026-09-01'), createSession('2026-09-03')];
    const previous: Streak = {
      ...INITIAL_STREAK,
      freezeUsedOn: ['2026-09-02'],
    };
    const args = {
      sessions,
      streakFreezeTokens: 1,
      now: new Date('2026-09-05T12:00:00'),
    };

    const first = computeStreak({ ...args, previousStreak: previous });
    expect(first.currentStreakDays).toBe(1);
    expect(first.freezeUsedOn).toEqual(['2026-09-04']);

    const second = computeStreak({ ...args, previousStreak: first });
    expect(second.currentStreakDays).toBe(1);
    expect(second.freezeUsedOn).toEqual(['2026-09-04']);
  });

  it('covers a previously frozen date without spending again', () => {
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [
      createSession('2026-08-19'),
      createSession('2026-08-17'),
      createSession('2026-08-16'),
    ];
    const result = computeStreak({
      sessions,
      previousStreak: { ...INITIAL_STREAK, freezeUsedOn: ['2026-08-18'] },
      now,
      streakFreezeTokens: 0,
    });
    expect(result.currentStreakDays).toBe(3);
    expect(result.freezeUsedOn).toEqual(['2026-08-18']);
  });

  it('refunds spent freezes once they no longer protect a live streak', () => {
    const now = new Date('2026-08-25T12:00:00');
    const result = computeStreak({
      sessions: [createSession('2026-08-25')],
      previousStreak: { ...INITIAL_STREAK, freezeUsedOn: ['2026-08-18'] },
      now,
      streakFreezeTokens: 1,
    });
    expect(result.currentStreakDays).toBe(1);
    expect(result.freezeUsedOn).toEqual([]);
  });

  it('does not spend a freeze when the streak is already dead', () => {
    // Last session 2026-08-10, now 8/19 — gap is far older than one freeze
    const now = new Date('2026-08-19T12:00:00');
    const result = computeStreak({
      sessions: [createSession('2026-08-10')],
      previousStreak: INITIAL_STREAK,
      now,
      streakFreezeTokens: 1,
    });
    expect(result.currentStreakDays).toBe(0);
    expect(result.freezeUsedOn).toEqual([]);
  });

  it('terminates when every weekday is a rest day', () => {
    const now = new Date('2026-08-19T12:00:00');
    const result = computeStreak({
      sessions: [createSession('2026-08-10')],
      previousStreak: INITIAL_STREAK,
      now,
      restDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    });
    expect(result.currentStreakDays).toBe(1);
  });
});
