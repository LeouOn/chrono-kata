import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { blockRepo } from '@/lib/db/block.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { toLocalDateString } from '@/lib/utils/date';
import { TodayPlanCard } from '@/components/planning/TodayPlanCard';

const openForLink = vi.fn();
vi.mock('@/components/session/SessionLauncher', () => ({
  useSessionLauncher: () => ({ openForLink }),
}));

let nowMs = 0;
vi.mock('@/hooks/useNow', () => ({ useNow: () => nowMs }));

const today = toLocalDateString(new Date());

function at(hours: number, minutes = 0): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
  openForLink.mockClear();
});

afterEach(cleanup);

async function seed(taskTitle: string, start: Date, end: Date) {
  const task = await taskRepo.create({ title: taskTitle, status: 'next', source: 'manual', estimateMin: 20 });
  await blockRepo.create({ start, end, kind: 'focus', title: 'Focus', taskId: task.id });
  return task;
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TodayPlanCard />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function waitForBlocks(client: QueryClient) {
  await waitFor(() => {
    const loaded = client
      .getQueryCache()
      .getAll()
      .some((query) => query.queryKey[0] === 'timelineBlocks' && query.state.status === 'success');
    expect(loaded).toBe(true);
  });
}

describe('Today card Now/Next', () => {
  it('shows the current block and starts it with the block length as the estimate', async () => {
    await seed('write the report', at(9), at(10, 30));
    nowMs = at(10, 0).getTime();
    renderCard();
    await waitFor(() => expect(screen.getByText(/Now · until 10:30/)).toBeTruthy());
    expect(screen.getByText('write the report')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start now: write the report' }));
    expect(openForLink).toHaveBeenCalledWith(expect.objectContaining({ taskId: expect.any(String), estimateMin: 90 }));
  });

  it('shows the next block and starts it with the block length as the estimate', async () => {
    await seed('buy paint', at(11), at(11, 45));
    nowMs = at(10, 0).getTime();
    renderCard();
    await waitFor(() => expect(screen.getByText(/Next · 11:00/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Start next: buy paint' }));
    expect(openForLink).toHaveBeenCalledWith(expect.objectContaining({ estimateMin: 45 }));
  });

  it('does not present tomorrow\'s focus block as today\'s Next', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await seed('write tomorrow', tomorrow, new Date(tomorrow.getTime() + 3_600_000));
    nowMs = at(10, 0).getTime();
    const { client } = renderCard();
    await waitForBlocks(client);
    expect(screen.queryByText(/Next · 09:00/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Start next:/ })).toBeNull();
  });

  it('still shows an overnight window\'s after-midnight block as Next at 23:50', async () => {
    await settingsRepo.patch({ wakingHours: { start: '20:00', end: '02:00' } });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 30, 0, 0);
    await seed('late call', tomorrow, new Date(tomorrow.getTime() + 3_600_000));
    nowMs = at(23, 50).getTime();
    renderCard();
    await waitFor(() => expect(screen.getByText(/Next · 00:30/)).toBeTruthy());
  });

  it('drops the Now strip once the block has ended, even with no other event', async () => {
    await seed('call bank', at(9), at(10));
    nowMs = at(10, 35).getTime();
    const { client } = renderCard();
    await waitForBlocks(client);
    expect(screen.queryByText(/Now · until/)).toBeNull();
    expect(screen.queryByText(/Next ·/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Start (now|next):/ })).toBeNull();
  });
});
