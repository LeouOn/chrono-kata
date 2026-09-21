import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/lib/streak/compute-streak';
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';

const baseSession = (startedAt: Date): Session => ({
  id: crypto.randomUUID(),
  startedAt,
  durationMinutes: 30,
  reps: null,
  rating: 3,
  createdAt: startedAt,
  updatedAt: startedAt,
});

const emptyStreak = (overrides: Partial<Streak> = {}): Streak => ({
  id: 'singleton',
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastSessionDate: '1970-01-01',
  milestonesAchieved: [],
  freezeUsedOn: [],
  updatedAt: new Date(),
  ...overrides,
});

describe('computeStreak', () => {
  it('returns streak=1 on first-ever session today', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const result = computeStreak({
      sessions: [baseSession(now)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
    expect(result.longestStreakDays).toBe(1);
    expect(result.lastSessionDate).toBe('2026-07-21');
    expect(result.milestonesAchieved).toEqual([]);
  });

  it('extends streak to 2 when yesterday also had a session', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const yesterday = new Date(2026, 6, 20, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(yesterday), baseSession(now)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it('keeps streak alive with 1-day grace (no session today, one yesterday)', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const yesterday = new Date(2026, 6, 20, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(yesterday)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
  });

  it('resets streak to 0 if last session was 2+ days ago', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const threeDaysAgo = new Date(2026, 6, 18, 10, 0);
    const result = computeStreak({
      sessions: [baseSession(threeDaysAgo)],
      previousStreak: emptyStreak({ currentStreakDays: 5, longestStreakDays: 5 }),
      now,
    });
    expect(result.currentStreakDays).toBe(0);
    expect(result.longestStreakDays).toBe(5); // preserved
  });

  it('counts 7 consecutive days as streak=7', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(7);
  });

  it('multi-session same day counts once', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const alsoNow = new Date(2026, 6, 21, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(now), baseSession(alsoNow)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
  });

  it('records 7 as a milestone when crossing from 6 to 7', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak({ currentStreakDays: 6, longestStreakDays: 6 }),
      now,
    });
    expect(result.milestonesAchieved).toContain(7);
  });

  it('preserves existing milestonesAchieved and appends new ones', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak({
        currentStreakDays: 6,
        longestStreakDays: 6,
        milestonesAchieved: [3],
      }),
      now,
    });
    expect(result.milestonesAchieved).toEqual([3, 7]);
  });
});
