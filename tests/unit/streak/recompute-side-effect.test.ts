import { describe, it, expect, beforeEach } from 'vitest';
import { recomputeStreakSideEffect } from '@/hooks/useSessions';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';

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
});
