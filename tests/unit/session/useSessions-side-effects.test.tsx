import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { habitRepo } from '@/lib/db/habit.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { pendingCalendarOpsRepo } from '@/lib/db/pending-calendar-ops.repo';
import { useSessions } from '@/hooks/useSessions';
import type { SessionInput } from '@/lib/schemas/session';

/**
 * A session logged against a task is still a session: the linked save path
 * (saveSessionWithOutcome) must run exactly the same post-save side effects as
 * the ordinary practice path, plus the task/project invalidations. This test
 * compares both paths in one place so a future refactor cannot quietly drop one.
 */

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

async function seedCalendarSync() {
  // Enabled calendar sync with no Google token: syncSessionCreateOrUpdate fails
  // and enqueues a pendingCalendarOp, which is the observable side effect.
  await settingsRepo.patch({ googleCalendarSyncEnabled: true, googleCalendarId: 'primary' });
}

function invalidatedKeys(invalidate: ReturnType<typeof setup>['invalidate']): string[] {
  return invalidate.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey?: unknown })?.queryKey));
}

const session = (overrides: Partial<SessionInput> = {}): SessionInput => ({
  startedAt: new Date(2026, 9, 23, 9, 0),
  durationMinutes: 20,
  rating: 4,
  ...overrides,
});

describe('createSession side effects (linked vs practice)', () => {
  it('runs every practice side effect for a LINKED session, plus tasks/projects invalidation', async () => {
    const task = await taskRepo.create({ title: 'report', status: 'next', source: 'manual' });
    await seedCalendarSync();

    const streakSave = vi.spyOn(streakRepo, 'save');
    const habitLookup = vi.spyOn(habitRepo, 'getAll');
    const llmLookup = vi.spyOn(llmSettingsRepo, 'get');
    const enqueue = vi.spyOn(pendingCalendarOpsRepo, 'enqueue');
    const { invalidate, wrapper } = setup();

    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createSession(
        session({ taskId: task.id, outcome: 'progress', breadcrumb: 'pick up here' }),
      );
    });

    // Streak recompute + persist.
    await waitFor(() => expect(streakSave).toHaveBeenCalled());
    // Coach comment pipeline entered (it gates on configured providers after this read).
    await waitFor(() => expect(llmLookup).toHaveBeenCalled());
    // Habit progress sync ran (it reads the habit list before matching).
    await waitFor(() => expect(habitLookup).toHaveBeenCalled());
    // Calendar sync ran and enqueued its failure instead of throwing.
    await waitFor(() => expect(enqueue).toHaveBeenCalled());

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContain(JSON.stringify(['tasks']));
    expect(keys).toContain(JSON.stringify(['projects']));
    expect(keys).toContain(JSON.stringify(['sessions']));
  });

  it('runs the same practice side effects for an UNLINKED session, without task/project invalidation', async () => {
    await seedCalendarSync();

    const streakSave = vi.spyOn(streakRepo, 'save');
    const habitLookup = vi.spyOn(habitRepo, 'getAll');
    const llmLookup = vi.spyOn(llmSettingsRepo, 'get');
    const enqueue = vi.spyOn(pendingCalendarOpsRepo, 'enqueue');
    const { invalidate, wrapper } = setup();

    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createSession(session());
    });

    await waitFor(() => expect(streakSave).toHaveBeenCalled());
    await waitFor(() => expect(llmLookup).toHaveBeenCalled());
    await waitFor(() => expect(habitLookup).toHaveBeenCalled());
    await waitFor(() => expect(enqueue).toHaveBeenCalled());

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContain(JSON.stringify(['sessions']));
    expect(keys).not.toContain(JSON.stringify(['tasks']));
    expect(keys).not.toContain(JSON.stringify(['projects']));
  });

  it('invalidates tasks/projects after updating or deleting a session', async () => {
    const task = await taskRepo.create({ title: 'report', status: 'next', source: 'manual' });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSessions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let sessionId = '';
    await act(async () => {
      const saved = await result.current.createSession(
        session({ taskId: task.id, outcome: 'progress', breadcrumb: 'pick up' }),
      );
      sessionId = saved.id;
    });
    invalidate.mockClear();

    await act(async () => {
      await result.current.updateSession({ id: sessionId, patch: { durationMinutes: 30 } });
    });
    await waitFor(() => {
      const keys = invalidatedKeys(invalidate);
      expect(keys).toContain(JSON.stringify(['tasks']));
      expect(keys).toContain(JSON.stringify(['projects']));
    });

    invalidate.mockClear();
    await act(async () => {
      await result.current.deleteSession(sessionId);
    });
    await waitFor(() => {
      const keys = invalidatedKeys(invalidate);
      expect(keys).toContain(JSON.stringify(['tasks']));
      expect(keys).toContain(JSON.stringify(['projects']));
    });
  });
});
