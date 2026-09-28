import { describe, it, expect, beforeEach } from 'vitest';
import { recomputeStreakSideEffect } from '@/hooks/useSessions';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from '@/lib/pacing/days';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('recomputeStreakSideEffect', () => {
  it('collapses a stale streak after missed days', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    await sessionRepo.save({
      startedAt: old,
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });
    await streakRepo.save({
      id: 'singleton',
      currentStreakDays: 5,
      longestStreakDays: 5,
      lastSessionDate: '2026-01-01',
      milestonesAchieved: [],
      freezeUsedOn: [],
      updatedAt: new Date(),
    });

    const next = await recomputeStreakSideEffect();

    expect(next.currentStreakDays).toBe(0);
    expect(next.longestStreakDays).toBe(5);
    expect((await streakRepo.get()).currentStreakDays).toBe(0);
  });

  it('keeps a live streak intact', async () => {
    const today = new Date();
    await sessionRepo.save({
      startedAt: today,
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });

    const next = await recomputeStreakSideEffect();

    expect(next.currentStreakDays).toBe(1);
  });

  it('counts a check-in-only day only while recovery mode is on', async () => {
    const todayKey = toLocalDateString(new Date());
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });
    await sessionRepo.save({
      startedAt: twoDaysAgo,
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });
    await checkInRepo.upsert({
      date: addDays(todayKey, -1),
      energy: 4,
      fog: 1,
      aches: 1,
      sleep: 1,
    });
    await settingsRepo.patch({ recoveryMode: true });

    const recoveryOn = await recomputeStreakSideEffect();
    expect(recoveryOn.currentStreakDays).toBe(3);
    expect(recoveryOn.freezeUsedOn).toEqual([]);

    await settingsRepo.patch({ recoveryMode: false });
    const recoveryOff = await recomputeStreakSideEffect();
    // Off: yesterday is a plain gap covered by the default 1 freeze token.
    expect(recoveryOff.currentStreakDays).toBe(2);
    expect(recoveryOff.freezeUsedOn).toEqual([addDays(todayKey, -1)]);
  });

  it('exempts a low-energy day without spending a freeze', async () => {
    const todayKey = toLocalDateString(new Date());
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });
    await sessionRepo.save({
      startedAt: threeDaysAgo,
      durationMinutes: 20,
      reps: null,
      rating: 3,
    });
    // Yesterday: depleted (energy 1 <= default threshold 2) — low-energy rest.
    // The day before: a check-in with decent energy — counts like a session.
    await checkInRepo.upsert({
      date: addDays(todayKey, -1),
      energy: 1,
      fog: 1,
      aches: 1,
      sleep: 1,
    });
    await checkInRepo.upsert({
      date: addDays(todayKey, -2),
      energy: 4,
      fog: 1,
      aches: 1,
      sleep: 1,
    });
    await settingsRepo.patch({ recoveryMode: true, streakFreezeTokens: 1 });

    const next = await recomputeStreakSideEffect();

    // Today + low-energy rest (free) + check-in day + 3-days-ago session.
    expect(next.currentStreakDays).toBe(3);
    expect(next.freezeUsedOn).toEqual([]);
  });
});
