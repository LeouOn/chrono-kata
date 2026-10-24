import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { TimelineScreen } from '@/components/timeline/TimelineScreen';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());
const FIXED_NOW = new Date();
FIXED_NOW.setHours(10, 0, 0, 0);
vi.mock('@/hooks/useNow', () => ({ useNow: () => FIXED_NOW.getTime() }));
const minutes = (n: number) => n * 60_000;

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.patch({ wakingHours: { start: '00:00', end: '23:59' } });
  await settingsRepo.setFlag('taskInbox', true);
});
afterEach(cleanup);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TimelineScreen dayKey={TODAY} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function seedTwoPicks(t2Status: 'next' | 'scheduled' = 'next') {
  const t1 = await taskRepo.create({ title: 'Morning work', status: 'next', source: 'manual', estimateMin: 30 });
  const t2 = await taskRepo.create({ title: 'Afternoon work', status: t2Status, source: 'manual', estimateMin: 30 });
  await dayPlanRepo.upsert(TODAY, { picks: [t1.id, t2.id], capacityMin: 120 });
  const now = FIXED_NOW.getTime();
  const started = await blockRepo.create({
    start: new Date(now - minutes(60)),
    end: new Date(now - minutes(30)),
    kind: 'focus',
    title: 'Focus',
    taskId: t1.id,
  });
  const future = await blockRepo.create({
    start: new Date(now + minutes(60)),
    end: new Date(now + minutes(90)),
    kind: 'focus',
    title: 'Focus',
    taskId: t2.id,
  });
  return { t1, t2, started, future };
}

describe('layout picks and the replan decision', () => {
  it('lays out the confirmed plan, not the ranker suggestions', async () => {
    const t1 = await taskRepo.create({ title: 'Morning work', status: 'next', source: 'manual', estimateMin: 30 });
    const t2 = await taskRepo.create({ title: 'Afternoon work', status: 'next', source: 'manual', estimateMin: 30 });
    await dayPlanRepo.upsert(TODAY, { picks: [t2.id], capacityMin: 120 });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /propose a layout/i }));
    expect(await screen.findByText('Afternoon work')).toBeTruthy();
    expect(screen.queryByText('Morning work')).toBeNull();
    expect(t1.id).toBeTruthy();
  });

  it('keeps a confirmed plan unchanged when nothing overflows', async () => {
    const t2 = await taskRepo.create({ title: 'Afternoon work', status: 'next', source: 'manual', estimateMin: 30 });
    await dayPlanRepo.upsert(TODAY, { picks: [t2.id], capacityMin: 120 });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /propose a layout/i }));
    expect(await screen.findByText('Afternoon work')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /apply this layout/i }));
    await waitFor(async () => {
      const plan = await dayPlanRepo.getByDate(TODAY);
      expect(plan?.picks).toEqual([t2.id]);
      expect(plan?.capacityMin).toBe(120);
    });
    expect(await screen.findByText(/Applied\. Your day is updated\./i)).toBeTruthy();
  });

  it('restores the plain "does not fit" line on the propose path', async () => {
    const t1 = await taskRepo.create({ title: 'Morning work', status: 'next', source: 'manual', estimateMin: 30 });
    await dayPlanRepo.upsert(TODAY, { picks: [t1.id], capacityMin: 120 });
    const now = FIXED_NOW.getTime();
    const end = new Date(now);
    end.setHours(23, 59, 0, 0);
    await blockRepo.create({ start: new Date(now), end, kind: 'fixed', title: 'All day' });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /propose a layout/i }));
    expect(await screen.findByText(/1 pick does not fit and will stay on your list/i)).toBeTruthy();
  });

  it('says "did not fit today" with no plan, before and after Apply, and clears the notice on a move', async () => {
    const task = await taskRepo.create({ title: 'Squeeze', status: 'next', source: 'manual', estimateMin: 30 });
    await taskRepo.create({ title: 'Squeeze two', status: 'next', source: 'manual', estimateMin: 30 });
    const now = FIXED_NOW.getTime();
    await blockRepo.create({
      start: new Date(now - minutes(60)),
      end: new Date(now - minutes(30)),
      kind: 'focus',
      title: 'Focus',
      taskId: task.id,
    });
    const end = new Date(now);
    end.setHours(23, 59, 0, 0);
    await blockRepo.create({ start: new Date(now), end, kind: 'fixed', title: 'All day' });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /replan from now/i }));
    expect(await screen.findByText(/1 pick did not fit today\./i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /apply replan/i }));
    expect(await screen.findByText(/Applied\. 1 pick did not fit today\./i)).toBeTruthy();
    const kept = await screen.findByRole('button', { name: /focus block Squeeze/i });
    fireEvent.keyDown(kept, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(screen.queryByText(/Applied\./i)).toBeNull());
  });

  it('does not call a tomorrow-only focus block "Replan from now"', async () => {
    const task = await taskRepo.create({ title: 'Tomorrow task', status: 'next', source: 'manual', estimateMin: 30 });
    const tomorrow = new Date(FIXED_NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await blockRepo.create({
      start: tomorrow,
      end: new Date(tomorrow.getTime() + minutes(30)),
      kind: 'focus',
      title: 'Focus',
      taskId: task.id,
    });
    const { client } = renderScreen();
    await waitFor(() => {
      const loaded = client
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey[0] === 'timelineBlocks' && query.state.status === 'success');
      expect(loaded).toBe(true);
    });
    expect(await screen.findByRole('button', { name: /propose a layout/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /replan from now/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /propose a layout/i }));
    expect(await screen.findByText(/focus block proposed/i)).toBeTruthy();
    expect(screen.queryByText(/will move after now/i)).toBeNull();
  });
});

describe('Replan from now', () => {
  it('keeps a started block, moves the future one, and names both before Apply', async () => {
    const seeded = await seedTwoPicks();
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /replan from now/i }));
    expect(await screen.findByText(/1 block will move after now; 1 already started and stay put/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /apply replan/i }));
    await waitFor(async () => {
      const started = await blockRepo.getById(seeded.started.id);
      expect(started?.start.getTime()).toBe(seeded.started.start.getTime());
      expect(await blockRepo.getById(seeded.future.id)).toBeUndefined();
      const all = await blockRepo.byKind('focus');
      const forT2 = all.filter((block) => block.taskId === seeded.t2.id);
      expect(forT2).toHaveLength(1);
      expect(forT2[0]!.start.getTime()).not.toBe(seeded.future.start.getTime());
    });
  });

  it('returns overflow picks to the list in the same apply', async () => {
    const seeded = await seedTwoPicks();
    const now = FIXED_NOW.getTime();
    await blockRepo.create({
      start: new Date(now),
      end: (() => { const end = new Date(now); end.setHours(23, 59, 0, 0); return end; })(),
      kind: 'fixed',
      title: 'All afternoon',
    });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /replan from now/i }));
    expect(await screen.findByText(/1 pick will go back to your list/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /apply replan/i }));
    await waitFor(async () => {
      const plan = await dayPlanRepo.getByDate(TODAY);
      expect(plan?.picks).toEqual([seeded.t1.id]);
    });
    expect(await screen.findByText(/Applied\. 1 pick is back on your list\./i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add a commitment/i }));
    await waitFor(() => expect(screen.queryByText(/Applied\./i)).toBeNull());
  });
});
