import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { usePlanToday } from '@/hooks/usePlanning';
import { useSettings } from '@/hooks/useSettings';
import { toLocalDateString } from '@/lib/utils/date';
import { localWallClockToEpoch } from '@/lib/planning/time';

const TODAY = toLocalDateString(new Date());
const DOMAIN_ID = '44444444-4444-4444-8444-444444444444';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper() {
  // One client per test: creating it inside the wrapper component would give
  // every re-render a fresh cache, which hides identity regressions.
  let client: QueryClient | null = null;
  return ({ children }: { children: React.ReactNode }) => {
    client ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function atLocal(hour: number, minute = 0): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

describe('usePlanToday', () => {
  it('clips anchors to the waking window for ranking too (out-of-window anchor adds nothing)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      wakingHours: { start: '09:00', end: '17:00' },
      anchors: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          title: 'Early block',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          start: '05:00',
          end: '07:00',
          domainId: DOMAIN_ID,
        },
      ],
    });
    await taskRepo.create({ title: 'too big for the day', status: 'next', source: 'manual', estimateMin: 400, domainId: DOMAIN_ID });
    await taskRepo.create({ title: 'fits the day', status: 'next', source: 'manual', estimateMin: 350, domainId: DOMAIN_ID });

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.picks.length).toBeGreaterThan(0));

    expect(result.current.capacity.capacityMin).toBe(360);
    const titles = result.current.picks.map((pick) => pick.task.title);
    expect(titles).toContain('fits the day');
    expect(titles).not.toContain('too big for the day');
  });

  it('lets an overnight same-domain anchor add availability after midnight', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      wakingHours: { start: '22:00', end: '02:00' },
      anchors: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          title: 'Night block',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          start: '00:30',
          end: '01:30',
          domainId: DOMAIN_ID,
        },
      ],
    });
    await taskRepo.create({ title: 'domain task', status: 'next', source: 'manual', estimateMin: 180, domainId: DOMAIN_ID });
    await taskRepo.create({ title: 'other task', status: 'next', source: 'manual', estimateMin: 180 });

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.picks.length).toBeGreaterThan(0));

    expect(result.current.capacity.capacityMin).toBe(135);
    const titles = result.current.picks.map((pick) => pick.task.title);
    expect(titles).toContain('domain task');
    expect(titles).not.toContain('other task');
  });

  it('counts fixed blocks after midnight in an overnight window', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '20:00', end: '02:00' } });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await blockRepo.create({
      start: new Date(localWallClockToEpoch(toLocalDateString(tomorrow), '00:30')),
      end: new Date(localWallClockToEpoch(toLocalDateString(tomorrow), '01:30')),
      kind: 'fixed',
      title: 'Night standup',
    });

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await waitFor(() => expect(result.current.capacity.fixedMin).toBe(60));
    expect(result.current.capacity.wakingMin).toBe(360);
  });

  it('keeps object identity across renders until settings change', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { result, rerender } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await waitFor(() => expect(result.current.capacity.wakingMin).toBeGreaterThan(0));

    const first = result.current;
    rerender();

    expect(result.current.wakingHours).toBe(first.wakingHours);
    expect(result.current.anchors).toBe(first.anchors);
    expect(result.current.capacity).toBe(first.capacity);
    expect(result.current.picks).toBe(first.picks);
  });

  it('does no task or plan work while the flag is off', async () => {
    const tasks = vi.spyOn(taskRepo, 'getAll');
    const blocks = vi.spyOn(blockRepo, 'range');
    const plan = vi.spyOn(dayPlanRepo, 'getByDate');

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabled).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(tasks).not.toHaveBeenCalled();
    expect(blocks).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(result.current.picks).toEqual([]);
  });

  it('builds capacity from waking hours, fixed blocks and anchors, and ranks the next tasks', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      wakingHours: { start: '09:00', end: '17:00' },
      anchors: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Lunch',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          start: '12:00',
          end: '13:00',
          domainId: null,
        },
      ],
    });
    await blockRepo.create({
      start: atLocal(10),
      end: atLocal(11),
      kind: 'fixed',
      title: 'Standup',
    });
    const small = await taskRepo.create({ title: 'small task', status: 'next', source: 'manual', estimateMin: 30 });
    await taskRepo.create({ title: 'too big', status: 'next', source: 'manual', estimateMin: 400 });

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await waitFor(() => expect(result.current.picks.length).toBeGreaterThan(0));

    // 480 waking - 60 fixed - 60 anchor = 360 free; 25% buffer = 90; capacity 270.
    expect(result.current.capacity).toMatchObject({
      wakingMin: 480,
      fixedMin: 60,
      anchorMin: 60,
      freeMin: 360,
      bufferMin: 90,
      capacityMin: 270,
    });

    expect(result.current.picks.map((pick) => pick.task.id)).toEqual([small.id]);
    expect(result.current.picks[0]?.reasons.join(' ')).toMatch(/fits the 270 minutes/);
    expect(result.current.dayPlan).toBeNull();
  });

  it('returns the confirmed plan for the day', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const task = await taskRepo.create({ title: 'picked', status: 'next', source: 'manual', estimateMin: 20 });
    await dayPlanRepo.upsert(TODAY, { picks: [task.id], capacityMin: 200 });

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.dayPlan?.picks).toEqual([task.id]));
    expect(result.current.dayPlan?.capacityMin).toBe(200);
  });

  it('recomputes capacity when waking hours change', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '09:00', end: '17:00' } });

    const { result } = renderHook(
      () => ({ plan: usePlanToday(), settings: useSettings() }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.plan.capacity.wakingMin).toBe(480));

    await act(async () => {
      await result.current.settings.updateSettings({ wakingHours: { start: '09:00', end: '12:00' } });
    });

    await waitFor(() => expect(result.current.plan.capacity.wakingMin).toBe(180));
    expect(result.current.plan.capacity.capacityMin).toBe(135);
  });

  it('treats a settings row without planning fields as the defaults', async () => {
    await settingsRepo.setFlag('taskInbox', true);

    const { result } = renderHook(() => usePlanToday(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    expect(result.current.wakingHours).toEqual({ start: '07:00', end: '22:00' });
    expect(result.current.anchors).toEqual([]);
    expect(result.current.capacity.wakingMin).toBe(900);
  });
});
