import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodayHabits } from '@/components/habits/TodayHabits';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { habitRepo } from '@/lib/db/habit.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { toLocalDateString } from '@/lib/utils/date';
import type { DayOfWeek } from '@/lib/schemas/settings';

const DAY_NAMES: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

beforeEach(async () => {
  await resetDbForTesting();
  localStorage.clear();
});

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodayHabits />
    </QueryClientProvider>
  );
}

describe('TodayHabits', () => {
  it('offers to add a habit when the catalog is empty', async () => {
    renderToday();
    expect(await screen.findByText('Nothing in the habit list yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a habit' })).toHaveAttribute('href', '/settings#habits');
  });

  it('says nothing is scheduled when today is an off day', async () => {
    const tomorrow = DAY_NAMES[(new Date().getDay() + 1) % 7]!;
    await habitRepo.create({
      name: 'Reading',
      kind: 'count',
      unit: 'pages',
      targetPerDay: 10,
      schedule: { kind: 'weekdays', days: [tomorrow] },
    });
    renderToday();
    expect(await screen.findByText('Nothing scheduled today.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add a habit' })).toBeNull();
  });

  it('marks a yes/no habit done and undoes it', async () => {
    await habitRepo.create({ name: 'Meds', kind: 'boolean', targetPerDay: null, schedule: { kind: 'daily' } });
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Meds done' }));
    expect(await screen.findByText("That's the list for today.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Meds' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark Meds done' })).toBeInTheDocument());
  });

  it('adds and removes one count, including when the stored entry is larger than one', async () => {
    const habit = await habitRepo.create({
      name: 'Water',
      kind: 'count',
      unit: 'glasses',
      targetPerDay: 8,
      schedule: { kind: 'daily' },
    });
    await habitLogRepo.add({
      habitId: habit.id,
      date: toLocalDateString(new Date()),
      minutes: null,
      delta: 10,
      source: 'manual',
    });
    renderToday();
    expect(await screen.findByText('10 of 8 glasses')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove 1 glasses from Water/ }));
    await waitFor(() => expect(screen.getByText('9 of 8 glasses')).toBeInTheDocument());
  });

  it('pauses a timed habit and keeps the running time', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    await habitRepo.create({
      name: 'Sit',
      kind: 'timed',
      targetPerDay: 10,
      schedule: { kind: 'daily' },
    });
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const pause = await screen.findByRole('button', { name: 'Pause' });
    await vi.advanceTimersByTimeAsync(5_000);
    fireEvent.click(pause);
    await waitFor(async () => {
      const logs = await habitLogRepo.getForDate(toLocalDateString(new Date()));
      expect(logs[0]?.minutes).toBeCloseTo(5 / 60, 2);
    });
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });
});
