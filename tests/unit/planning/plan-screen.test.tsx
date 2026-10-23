import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { PlanScreen } from '@/components/planning/PlanScreen';
import { ToastProvider } from '@/components/ui/Toast';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());
const GUILT = /overdue|late\b|behind|missed|failed|should have/i;

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

async function seedNextTasks(titles: string[]) {
  const tasks = [];
  for (const title of titles) {
    tasks.push(await taskRepo.create({ title, status: 'next', source: 'manual', estimateMin: 20 }));
  }
  return tasks;
}

describe('PlanScreen', () => {
  it('says planning is a preview when the flag is off', async () => {
    renderWithProviders(<PlanScreen />);
    expect(await screen.findByText(/Planning is a preview feature/)).toBeInTheDocument();
  });

  it('shows capacity, suggestions with reasons, and saves nothing before Confirm', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '09:00', end: '17:00' } });
    const [first] = await seedNextTasks(['write the report']);

    renderWithProviders(<PlanScreen dayKey={TODAY} />);

    expect(await screen.findByText(/You have 360 minutes for picks today/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Remove write the report from today's picks/i })).toBeInTheDocument();
    expect(screen.getByText(/fits the 360 minutes/)).toBeInTheDocument();
    expect(await dayPlanRepo.getByDate(TODAY)).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));
    await waitFor(async () => {
      const plan = await dayPlanRepo.getByDate(TODAY);
      expect(plan?.picks).toEqual([first!.id]);
    });
  });

  it('lets the user remove and add picks, never more than three', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '09:00', end: '17:00' } });
    const tasks = await seedNextTasks(['one', 'two', 'three', 'four']);

    renderWithProviders(<PlanScreen dayKey={TODAY} />);

    // Which three of the four are suggested is up to the deterministic ranking
    // (createdAt ties break by id), so derive the expectation from the screen.
    const removes = await screen.findAllByRole('button', { name: /Remove .* from today's picks/i });
    expect(removes).toHaveLength(3);
    expect(screen.queryByLabelText('Add a task by hand')).toBeNull();

    const removedLabel = removes[0]!.getAttribute('aria-label')!;
    const removedTitle = removedLabel.replace(/^Remove /, '').replace(/ from today's picks$/, '');
    fireEvent.click(removes[0]!);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: `Remove ${removedTitle} from today's picks` })).toBeNull(),
    );

    const add = await screen.findByLabelText('Add a task by hand');
    const draftedTitles = screen
      .queryAllByRole('button', { name: /Remove .* from today's picks/i })
      .map((button) => button.getAttribute('aria-label')!.replace(/^Remove /, '').replace(/ from today's picks$/, ''));
    const replacement = tasks.find((task) => !draftedTitles.includes(task.title))!;
    fireEvent.change(add, { target: { value: replacement.id } });

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Remove .* from today's picks/i })).toHaveLength(3),
    );
    expect(
      screen.getByRole('button', { name: `Remove ${replacement.title} from today's picks` }),
    ).toBeInTheDocument();
  });

  it('shows the neutral overcommit message when picks do not fit, and still saves', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '09:00', end: '10:00' } });
    await taskRepo.create({ title: 'big one', status: 'next', source: 'manual', estimateMin: 25 });
    await taskRepo.create({ title: 'big two', status: 'next', source: 'manual', estimateMin: 25 });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    expect(await screen.findByText(/5 more than the 45 you have today/)).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status.textContent ?? '').not.toMatch(GUILT);

    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));
    await waitFor(async () => expect(await dayPlanRepo.getByDate(TODAY)).toBeDefined());
  });

  it('shows the confirmed plan on reopen instead of fresh suggestions', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const [first, second] = await seedNextTasks(['picked task', 'suggested task']);
    await dayPlanRepo.upsert(TODAY, { picks: [first!.id], capacityMin: 200 });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    expect(await screen.findByText('Your picks')).toBeInTheDocument();
    expect(screen.getByText('picked task')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove suggested task from today's picks/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Remove picked task from today's picks/i })).toBeInTheDocument();
    expect(second).toBeTruthy();
  });

  it('writes only once when Confirm is triggered twice', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['one pick']);
    const upsert = vi.spyOn(dayPlanRepo, 'upsert');
    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByRole('button', { name: /Remove one pick from today's picks/i });

    const button = screen.getByRole('button', { name: /Confirm today/i });
    // Two clicks in one act(), before React re-renders: the disabled attribute
    // cannot help here, so the in-flight ref is what must stop the second write.
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
  });

  it('renders no guilt wording anywhere on the screen', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['a task']);
    const { container } = renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByRole('button', { name: /Remove a task from today's picks/i });
    expect(container.textContent ?? '').not.toMatch(GUILT);
    void getDb;
  });
});
