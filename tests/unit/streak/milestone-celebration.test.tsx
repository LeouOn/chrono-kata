/**
 * The milestone celebration only follows a save that EARNED a milestone.
 *
 * It used to compare the milestone list with what the screen last saw, so restoring a backup onto a new
 * device (or any other way a streak simply arrives) threw confetti over the result. These tests go through
 * the real paths: a real restore, the app-open recompute, a remount, and a real session save.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MilestoneCelebration } from '@/components/streak/MilestoneCelebration';
import { recomputeStreakSideEffect, useSessions } from '@/hooks/useSessions';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { MILESTONE_EVENT } from '@/lib/streak/milestones';
import { addDays } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';

const THREE_DAYS = 'Three days. The shape is forming.';
const SEVEN_DAYS = 'Seven days. One full week — the path finds its rhythm.';

beforeEach(async () => {
  cleanup();
  await resetDbForTesting();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function mountCelebration() {
  return render(
    <QueryClientProvider client={client()}>
      <MilestoneCelebration />
    </QueryClientProvider>,
  );
}

const today = () => toLocalDateString(new Date());
const at = (dayKey: string, hour = 9) => {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, 0);
};
const celebrating = () => screen.queryByText('day streak');
const quiet = (ms = 250) => act(async () => new Promise((r) => setTimeout(r, ms)));

/** A backup of a person who has been at it for 8 days and has already had the 3- and 7-day celebrations. */
function backupWithMilestones() {
  const now = new Date().toISOString();
  return JSON.stringify({
    version: 2,
    exportedAt: now,
    sessions: [],
    reflections: [],
    streak: {
      id: 'singleton',
      currentStreakDays: 8,
      longestStreakDays: 8,
      lastSessionDate: today(),
      milestonesAchieved: [3, 7],
      freezeUsedOn: [],
      updatedAt: now,
    },
    settings: null,
    llmSettings: null,
  });
}

describe('a streak that ARRIVES is not an achievement', () => {
  it('restoring a backup with milestones [3, 7] onto an empty device celebrates nothing', async () => {
    mountCelebration();
    await quiet(50);
    const parsed = parseEnvelope(backupWithMilestones());
    if (!parsed.ok) throw new Error(parsed.error);
    await act(async () => {
      await replaceAll(parsed.envelope);
    });
    expect((await streakRepo.get()).milestonesAchieved).toEqual([3, 7]);
    await quiet();
    expect(celebrating()).toBeNull();
    expect(screen.queryByText(SEVEN_DAYS)).toBeNull();
  });

  it('and not on the NEXT app open: the layout\'s recompute and a fresh mount stay quiet too', async () => {
    const parsed = parseEnvelope(backupWithMilestones());
    if (!parsed.ok) throw new Error(parsed.error);
    await replaceAll(parsed.envelope);
    // Sessions that imply the milestones, as a real restore of a real history would have.
    for (let i = 0; i < 8; i += 1) await sessionRepo.save({ startedAt: at(addDays(today(), -i)), durationMinutes: 20, reps: null, rating: 3 });
    // The streak record in the file is older than the history: the next open re-derives it and "finds" milestones.
    await streakRepo.save({ ...(await streakRepo.get()), currentStreakDays: 0, milestonesAchieved: [], updatedAt: new Date() });

    const first = mountCelebration();
    await act(async () => {
      await recomputeStreakSideEffect(); // what the layout does on every open
    });
    expect((await streakRepo.get()).milestonesAchieved.length).toBeGreaterThan(0); // it did find them...
    await quiet();
    expect(celebrating()).toBeNull(); // ...and said nothing
    first.unmount();
    mountCelebration(); // the next open
    await quiet();
    expect(celebrating()).toBeNull();
  });

  it('a recompute that is not a save never announces, even when it finds a new milestone', async () => {
    const heard = vi.fn();
    window.addEventListener(MILESTONE_EVENT, heard);
    for (let i = 0; i < 3; i += 1) await sessionRepo.save({ startedAt: at(addDays(today(), -i)), durationMinutes: 20, reps: null, rating: 3 });
    const next = await recomputeStreakSideEffect();
    expect(next.milestonesAchieved).toContain(3);
    expect(heard).not.toHaveBeenCalled();
    await recomputeStreakSideEffect({ celebrate: true }); // nothing NEW now
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(MILESTONE_EVENT, heard);
  });
});

describe('what a saving recompute announces', () => {
  it('says one thing, once: the milestone the save crossed (the highest, when it crosses several)', async () => {
    const heard: number[] = [];
    const listener = (e: Event) => heard.push((e as CustomEvent<{ milestone: number }>).detail.milestone);
    window.addEventListener(MILESTONE_EVENT, listener);
    try {
      for (let i = 0; i < 7; i += 1) await sessionRepo.save({ startedAt: at(addDays(today(), -i)), durationMinutes: 20, reps: null, rating: 3 });
      await streakRepo.save({ ...(await streakRepo.get()), currentStreakDays: 0, milestonesAchieved: [], updatedAt: new Date() });
      const next = await recomputeStreakSideEffect({ celebrate: true });
      expect(next.milestonesAchieved).toEqual([7]); // crossing 3 and 7 in one go records the highest
      expect(heard).toEqual([7]);
    } finally {
      window.removeEventListener(MILESTONE_EVENT, listener);
    }
  });
});

describe('a save that EARNS a milestone still celebrates, once', () => {
  async function save(result: { current: ReturnType<typeof useSessions> }, startedAt: Date) {
    await act(async () => {
      await result.current.createSession({ startedAt, durationMinutes: 20, rating: 4 } as never);
    });
  }

  it('the third day in a row through the real session-save path', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
    await sessionRepo.save({ startedAt: at(addDays(today(), -2)), durationMinutes: 20, reps: null, rating: 3 });
    await sessionRepo.save({ startedAt: at(addDays(today(), -1)), durationMinutes: 20, reps: null, rating: 3 });
    await recomputeStreakSideEffect(); // the streak the person already has: 2 days, no milestone
    expect((await streakRepo.get()).milestonesAchieved).toEqual([]);

    mountCelebration();
    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await save(result, at(today(), 8));
    await waitFor(() => expect(screen.getAllByText(THREE_DAYS)).toHaveLength(1)); // once, not twice
    expect(screen.getAllByText('day streak')).toHaveLength(1);
    expect((await streakRepo.get()).milestonesAchieved).toEqual([3]);

    // Another save the same day earns nothing new: no second celebration.
    await act(async () => { screen.getByText(THREE_DAYS).click(); }); // dismiss
    await waitFor(() => expect(celebrating()).toBeNull());
    await save(result, at(today(), 18));
    await quiet();
    expect(celebrating()).toBeNull();
  });

  it('a save that earns nothing says nothing', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
    mountCelebration();
    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await save(result, at(today(), 8));
    await quiet();
    expect(celebrating()).toBeNull();
  });

  it('shows the highest milestone when one save crosses several, and goes away by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      mountCelebration();
      await act(async () => {
        window.dispatchEvent(new CustomEvent(MILESTONE_EVENT, { detail: { milestone: 7 } }));
      });
      expect(screen.getByText(SEVEN_DAYS)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(celebrating()).toBeNull()); // (after its short fade-out)
  });

  it('ignores an event that does not carry a milestone', async () => {
    mountCelebration();
    for (const event of [
      new CustomEvent(MILESTONE_EVENT, { detail: { milestone: 'seven' } }),
      new CustomEvent(MILESTONE_EVENT, { detail: { milestone: Number.NaN } }),
      new CustomEvent(MILESTONE_EVENT),
    ]) {
      await act(async () => {
        window.dispatchEvent(event);
      });
      await quiet(50);
      expect(celebrating()).toBeNull(); // each on its own, so a later good-looking state cannot hide an earlier one
    }
  });
});
