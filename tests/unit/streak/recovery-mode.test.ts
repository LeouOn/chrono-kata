import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/lib/streak/compute-streak';
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';
import type { DayOfWeek } from '@/lib/schemas/settings';

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

describe('Recovery-mode streaks', () => {
  it('ignores check-in and low-energy sets entirely when recovery mode is off', () => {
    // Wednesday now, session Monday, check-in-only Tuesday gap.
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [createSession('2026-08-19'), createSession('2026-08-17')];
    const sets = {
      checkInDays: new Set(['2026-08-18']),
      lowEnergyDays: new Set(['2026-08-18']),
    };

    // Baseline: no recovery args at all, no freeze tokens — streak stops at today.
    const baseline = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
    });
    expect(baseline.currentStreakDays).toBe(1);

    // Explicitly off: identical outcome despite the sets being passed.
    const explicitlyOff = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: false,
      ...sets,
    });
    expect(explicitlyOff.currentStreakDays).toBe(baseline.currentStreakDays);
    expect(explicitlyOff.freezeUsedOn).toEqual(baseline.freezeUsedOn);

    // Default (flag omitted): sets still ignored.
    const defaulted = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      ...sets,
    });
    expect(defaulted.currentStreakDays).toBe(baseline.currentStreakDays);
  });

  it('counts a check-in-only day like a session day when recovery mode is on', () => {
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [createSession('2026-08-19'), createSession('2026-08-17')];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: true,
      checkInDays: new Set(['2026-08-18']),
    });

    // Wed session + Tue check-in + Mon session, and no freeze spent.
    expect(result.currentStreakDays).toBe(3);
    expect(result.freezeUsedOn).toEqual([]);
  });

  it('rests a low-energy check-in day instead of counting it (low-energy wins)', () => {
    // A day in both sets is exempt like a rest day: no break, no freeze,
    // and no increment. (In the real pipeline lowEnergyDays ⊆ checkInDays,
    // so this precedence is what makes the exemption reachable at all.)
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [createSession('2026-08-19'), createSession('2026-08-17')];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: true,
      checkInDays: new Set(['2026-08-18']),
      lowEnergyDays: new Set(['2026-08-18']),
    });

    expect(result.currentStreakDays).toBe(2);
    expect(result.freezeUsedOn).toEqual([]);
  });

  it('a low-energy day is exempt and does not consume a freeze token', () => {
    // Wed 8/19 session, Tue 8/18 plain gap, Mon 8/17 low-energy, Sun 8/16 session.
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [createSession('2026-08-19'), createSession('2026-08-16')];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: true,
      lowEnergyDays: new Set(['2026-08-17']),
      streakFreezeTokens: 1,
    });

    // The single token covers only Tue 8/18; Mon 8/17 passes for free.
    // Exempt and freeze days do not increment — only the two sessions count.
    expect(result.currentStreakDays).toBe(2);
    expect(result.freezeUsedOn).toEqual(['2026-08-18']);
  });

  it('handles mixed rest days + low-energy days + freezes in one walk', () => {
    // Tue 8/18 session (now), Mon 8/17 low-energy check-in,
    // Sun 8/16 + Sat 8/15 weekend rest days, Fri 8/14 plain gap,
    // Thu 8/13 session.
    const now = new Date('2026-08-18T12:00:00');
    const sessions = [createSession('2026-08-18'), createSession('2026-08-13')];
    const args = {
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: true,
      checkInDays: new Set(['2026-08-17']),
      lowEnergyDays: new Set(['2026-08-17']),
      restDays: ['sat', 'sun'] as DayOfWeek[],
    };

    // One token: spent on the only uncovered gap (Fri 8/14). The low-energy
    // day and both rest days pass without spending anything.
    const withOneToken = computeStreak({ ...args, streakFreezeTokens: 1 });
    expect(withOneToken.currentStreakDays).toBe(2);
    expect(withOneToken.freezeUsedOn).toEqual(['2026-08-14']);

    // Zero tokens: the walk still passes the exempt days and dies at 8/14,
    // so the low-energy/rest exemptions provably spend nothing.
    const withNoTokens = computeStreak({ ...args, streakFreezeTokens: 0 });
    expect(withNoTokens.currentStreakDays).toBe(1);
    expect(withNoTokens.freezeUsedOn).toEqual([]);

    // Recovery off, same data: Mon 8/17 becomes a plain gap that eats the
    // token, and Fri 8/14 then breaks the walk — sets are ignored when off.
    const recoveryOff = computeStreak({
      ...args,
      recoveryMode: false,
      streakFreezeTokens: 1,
    });
    expect(recoveryOff.currentStreakDays).toBe(1);
    expect(recoveryOff.freezeUsedOn).toEqual(['2026-08-17']);
  });

  it('is idempotent with the new sets (fixed point holds)', () => {
    const now = new Date('2026-08-19T12:00:00');
    const sessions = [createSession('2026-08-19'), createSession('2026-08-16')];
    const args = {
      sessions,
      now,
      recoveryMode: true,
      lowEnergyDays: new Set(['2026-08-17']),
      streakFreezeTokens: 1,
    };

    const first = computeStreak({ ...args, previousStreak: INITIAL_STREAK });
    const second = computeStreak({ ...args, previousStreak: first });
    expect(second.currentStreakDays).toBe(first.currentStreakDays);
    expect(second.freezeUsedOn).toEqual(first.freezeUsedOn);
    expect(second.longestStreakDays).toBe(first.longestStreakDays);
  });

  it('matches low-energy membership by local date key across midnight', () => {
    // Session timestamps hug midnight on both sides. Day-key math must be
    // local (toLocalDateString); a toISOString-derived key would shift the
    // late-evening session to the next day in western timezones.
    const now = new Date(2026, 7, 19, 0, 30); // Wed 8/19 00:30 local
    const mondayNight = new Date(2026, 7, 17, 23, 45); // Mon 8/17 23:45 local
    const sessions: Session[] = [
      { ...createSession('2026-08-19'), startedAt: now },
      { ...createSession('2026-08-17'), startedAt: mondayNight },
    ];

    const result = computeStreak({
      sessions,
      previousStreak: INITIAL_STREAK,
      now,
      recoveryMode: true,
      checkInDays: new Set(['2026-08-18']),
    });

    // Wed 00:30 session + Tue check-in + Mon 23:45 session.
    expect(result.currentStreakDays).toBe(3);
  });
});
