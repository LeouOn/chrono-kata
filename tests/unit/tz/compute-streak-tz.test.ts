/**
 * TZ is set inside each test. Streak walking uses calendar days (`setDate`), not 86_400_000 ms.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { computeStreak } from '@/lib/streak/compute-streak';
import { toLocalDateString } from '@/lib/utils/date';
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';

const previousTz = process.env.TZ;

afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function sessionAt(startedAt: Date): Session {
  return {
    id: crypto.randomUUID(),
    startedAt,
    durationMinutes: 20,
    reps: null,
    rating: 3,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function emptyStreak(): Streak {
  return {
    id: 'singleton',
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastSessionDate: '1970-01-01',
    milestonesAchieved: [],
    freezeUsedOn: [],
    updatedAt: new Date(),
  };
}

function local(y: number, m: number, d: number, h = 12, min = 0) {
  return new Date(y, m, d, h, min);
}

describe('streaks across DST and a timezone move', () => {
  it('survives spring forward and fall back in Los Angeles', () => {
    process.env.TZ = 'America/Los_Angeles';
    const springNow = local(2026, 2, 8, 18, 0);
    const spring = computeStreak({
      sessions: [sessionAt(local(2026, 2, 7, 23, 30)), sessionAt(springNow)],
      previousStreak: emptyStreak(),
      now: springNow,
    });
    expect(spring.currentStreakDays).toBe(2);

    const fallNow = local(2026, 10, 1, 18, 0);
    const fall = computeStreak({
      sessions: [sessionAt(local(2026, 9, 31, 23, 30)), sessionAt(fallNow)],
      previousStreak: emptyStreak(),
      now: fallNow,
    });
    expect(fall.currentStreakDays).toBe(2);
  });

  it('survives spring forward and fall back in Helsinki', () => {
    process.env.TZ = 'Europe/Helsinki';
    const springNow = local(2026, 2, 29, 18, 0);
    const spring = computeStreak({
      sessions: [sessionAt(local(2026, 2, 28, 23, 30)), sessionAt(springNow)],
      previousStreak: emptyStreak(),
      now: springNow,
    });
    expect(spring.currentStreakDays).toBe(2);

    const fallNow = local(2026, 9, 25, 18, 0);
    const fall = computeStreak({
      sessions: [sessionAt(local(2026, 9, 24, 23, 30)), sessionAt(fallNow)],
      previousStreak: emptyStreak(),
      now: fallNow,
    });
    expect(fall.currentStreakDays).toBe(2);
  });

  it('keeps a Helsinki evening and the next Los Angeles evening on consecutive local days', () => {
    process.env.TZ = 'America/Los_Angeles';
    const helsinkiEvening = new Date('2026-07-20T20:30:00.000Z');
    const losAngelesEvening = new Date('2026-07-22T06:30:00.000Z');
    expect(toLocalDateString(helsinkiEvening)).toBe('2026-07-20');
    expect(toLocalDateString(losAngelesEvening)).toBe('2026-07-21');
    const result = computeStreak({
      sessions: [sessionAt(helsinkiEvening), sessionAt(losAngelesEvening)],
      previousStreak: emptyStreak(),
      now: losAngelesEvening,
    });
    expect(result.currentStreakDays).toBe(2);
  });
});
