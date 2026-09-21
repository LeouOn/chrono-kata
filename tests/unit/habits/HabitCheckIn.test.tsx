import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HabitCheckIn } from '@/components/habits/HabitCheckIn';
import { habitRepo } from '@/lib/db/habit.repo';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { toLocalDateString } from '@/lib/utils/date';
import type { DayOfWeek } from '@/lib/schemas/settings';

const DAY_NAMES: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

afterEach(cleanup);

beforeEach(async () => {
  await resetDbForTesting();
});

function renderCheckIn() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HabitCheckIn />
    </QueryClientProvider>
  );
}

describe('HabitCheckIn', () => {
  it('renders nothing when no habits exist', async () => {
    const { container } = renderCheckIn();
    await waitFor(() => expect(screen.queryByText(/today's habits/i)).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles a boolean habit and untoggles it', async () => {
    const habit = await habitRepo.create({
      name: 'Water plants',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
    });
    renderCheckIn();

    const toggle = await screen.findByRole('button', { name: /mark water plants done/i });
    fireEvent.click(toggle);

    await waitFor(async () => {
      const logs = await habitLogRepo.getForHabitAndDate(habit.id, toLocalDateString(new Date()));
      expect(logs).toHaveLength(1);
    });

    const undo = await screen.findByRole('button', { name: /mark water plants not done/i });
    fireEvent.click(undo);

    await waitFor(async () => {
      const logs = await habitLogRepo.getForHabitAndDate(habit.id, toLocalDateString(new Date()));
      expect(logs).toHaveLength(0);
    });
  });

  it('increments and undoes a count habit', async () => {
    const habit = await habitRepo.create({
      name: 'Reading',
      kind: 'count',
      unit: 'pages',
      targetPerDay: 10,
      schedule: { kind: 'daily' },
    });
    renderCheckIn();

    fireEvent.click(await screen.findByRole('button', { name: /add one pages to reading/i }));
    await waitFor(() => expect(screen.getByText('1 / 10 pages')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /remove one pages from reading/i }));
    await waitFor(() => expect(screen.getByText('0 / 10 pages')).toBeInTheDocument());
  });

  it('shows a linked session as complete and blocks untoggling', async () => {
    const habit = await habitRepo.create({
      name: 'Stretching',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'Daily stretches',
    });
    await habitLogRepo.add({
      habitId: habit.id,
      date: toLocalDateString(new Date()),
      minutes: null,
      delta: null,
      source: 'session',
      sessionId: crypto.randomUUID(),
    });
    renderCheckIn();

    const toggle = await screen.findByRole('button', { name: /mark stretching/i });
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('hides habits not scheduled today', async () => {
    const todayName = DAY_NAMES[new Date().getDay()]!;
    const otherDays = DAY_NAMES.filter((d) => d !== todayName);
    await habitRepo.create({
      name: 'Weekend thing',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'weekdays', days: otherDays },
    });
    renderCheckIn();

    await waitFor(() => expect(screen.queryByText('Weekend thing')).toBeNull());
  });

  it('adds a backdated timed entry through the expander', async () => {
    const habit = await habitRepo.create({
      name: 'Stretching',
      kind: 'timed',
      targetPerDay: 7,
      schedule: { kind: 'daily' },
    });
    renderCheckIn();

    fireEvent.click(
      await screen.findByRole('button', { name: /log an entry for stretching/i })
    );
    const dateInput = screen.getByLabelText('Day');
    fireEvent.change(dateInput, { target: { value: '2026-09-19' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 3.5'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(async () => {
      const logs = await habitLogRepo.getForHabitAndDate(habit.id, '2026-09-19');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.minutes).toBe(3.5);
    });
  });
});
