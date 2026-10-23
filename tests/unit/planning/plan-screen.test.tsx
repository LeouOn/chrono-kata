import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { blockRepo } from '@/lib/db/block.repo';
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

  it('shows the saved plan immediately, without waiting for the refetch', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const [task] = await seedNextTasks(['one pick']);
    let call = 0;
    const realGet = dayPlanRepo.getByDate.bind(dayPlanRepo);
    vi.spyOn(dayPlanRepo, 'getByDate').mockImplementation((day: string) => {
      call += 1;
      // The first read (initial load) is real; every later refetch hangs, so a
      // cache-seeded Confirm is the only way "Your picks" can appear.
      return call === 1 ? realGet(day) : new Promise(() => {});
    });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByRole('button', { name: /Remove one pick from today's picks/i });
    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));

    expect(await screen.findByText('Your picks')).toBeInTheDocument();
    expect(screen.getByText('one pick')).toBeInTheDocument();
    expect(task).toBeTruthy();
  });

  it('never shows the empty-picks flash while confirming', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['one', 'two', 'three']);
    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findAllByRole('button', { name: /Remove .* from today's picks/i });

    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));
    await screen.findByText('Your picks');
    observer.disconnect();

    expect(seen.some((text) => text.includes('No picks yet'))).toBe(false);
  });

  it('excludes a pick that was finished elsewhere and does not count it', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const done = await taskRepo.create({ title: 'finished task', status: 'next', source: 'manual', estimateMin: 40 });
    const active = await taskRepo.create({ title: 'remaining task', status: 'next', source: 'manual', estimateMin: 20 });
    await taskRepo.setStatus(done.id, 'done');
    await dayPlanRepo.upsert(TODAY, { picks: [done.id, active.id], capacityMin: 200 });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByText('remaining task');
    expect(screen.queryByText('finished task')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove finished task/ })).toBeNull();
    // The overcommit total counts only the remaining pick (20 minutes).
    expect(screen.getByRole('status')).toHaveTextContent(/These add up to 20 minutes/);
  });

  it('labels suggestions honestly when every confirmed pick is done', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const done = await taskRepo.create({ title: 'finished task', status: 'next', source: 'manual', estimateMin: 40 });
    await taskRepo.create({ title: 'next candidate', status: 'next', source: 'manual', estimateMin: 20 });
    await taskRepo.setStatus(done.id, 'done');
    await dayPlanRepo.upsert(TODAY, { picks: [done.id], capacityMin: 200 });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByText(/Suggested for the rest of today/);
    expect(screen.queryByText('Your picks')).toBeNull();
    expect(screen.getByText(/All of today's picks are done/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm today/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update today/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Remove next candidate/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));
    await waitFor(async () => {
      const plan = await dayPlanRepo.getByDate(TODAY);
      expect(plan?.picks).toHaveLength(1);
      expect(plan?.picks[0]).not.toBe(done.id);
    });
  });

  it('does not claim an empty confirmed plan is all done', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await taskRepo.create({ title: 'candidate', status: 'next', source: 'manual', estimateMin: 20 });
    await dayPlanRepo.upsert(TODAY, { picks: [], capacityMin: 200 });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByText(/Suggested for the rest of today/);
    expect(screen.queryByText(/All of today's picks are done/)).toBeNull();
    expect(screen.getByRole('button', { name: /Confirm today/i })).toBeInTheDocument();
  });

  it('lets the user swap a pick for another task', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['first', 'second', 'third', 'fourth']);
    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findAllByRole('button', { name: /Remove .* from today's picks/i });

    const swap = screen.getAllByLabelText('Swap for another task')[0]!;
    const candidate = Array.from(swap.querySelectorAll('option'))
      .slice(1)
      .find((option) => option.value !== '');
    expect(candidate).toBeDefined();
    fireEvent.change(swap, { target: { value: candidate!.value } });

    expect(
      await screen.findByRole('button', { name: `Remove ${candidate!.textContent} from today's picks` }),
    ).toBeInTheDocument();
  });

  it('resets the draft when the day rolls over', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['one', 'two', 'three']);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PlanScreen dayKey="2026-06-15" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findAllByRole('button', { name: /Remove .* from today's picks/i });
    fireEvent.click(screen.getAllByRole('button', { name: /Remove .* from today's picks/i })[0]!);
    await screen.findByLabelText('Add a task by hand');

    view.rerender(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PlanScreen dayKey="2026-06-16" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    // Fresh suggestions for the new day, not the edited draft.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Remove .* from today's picks/i })).toHaveLength(3),
    );
    expect(screen.queryByLabelText('Add a task by hand')).toBeNull();
  });

  it('shows a loading state first when tasks arrive late', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedNextTasks(['late task']);
    let resolveTasks!: (tasks: Awaited<ReturnType<typeof taskRepo.getAll>>) => void;
    const realGetAll = taskRepo.getAll.bind(taskRepo);
    const pending = new Promise<Awaited<ReturnType<typeof taskRepo.getAll>>>((resolve) => {
      resolveTasks = resolve;
    });
    let first = true;
    vi.spyOn(taskRepo, 'getAll').mockImplementation(() => {
      if (first) {
        first = false;
        return pending;
      }
      return realGetAll();
    });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    expect(await screen.findByText(/Loading today's plan/)).toBeInTheDocument();
    expect(screen.queryByText('No picks yet.')).toBeNull();

    resolveTasks(await realGetAll());
    expect(await screen.findByText('late task')).toBeInTheDocument();
  });

  it('saves the computed capacity with the picks', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ wakingHours: { start: '09:00', end: '17:00' } });
    await seedNextTasks(['one pick']);
    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByRole('button', { name: /Remove one pick from today's picks/i });
    fireEvent.click(screen.getByRole('button', { name: /Confirm today/i }));

    await waitFor(async () => {
      const plan = await dayPlanRepo.getByDate(TODAY);
      expect(plan?.capacityMin).toBe(360);
      expect(plan?.picks).toHaveLength(1);
    });
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

  it('states capacity arithmetic that adds up when fixed and anchor overlap', async () => {
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
      start: new Date(new Date().setHours(12, 30, 0, 0)),
      end: new Date(new Date().setHours(13, 30, 0, 0)),
      kind: 'fixed',
      title: 'Overlapping meeting',
    });

    renderWithProviders(<PlanScreen dayKey={TODAY} />);
    await screen.findByText(/You have \d+ minutes for picks today/);
    // Wait for the fixed-block query to land before reading the arithmetic.
    await waitFor(() =>
      expect(screen.getByText(/You have \d+ minutes for picks today/).textContent).toMatch(
        /minus 90 for fixed or protected time/,
      ),
    );
    const sentence = screen.getByText(/You have \d+ minutes for picks today/);
    const numbers = (sentence.textContent ?? '').match(/\d+/g)!.map(Number);
    const [capacity, awake, occupied, buffer] = numbers;
    expect(awake! - occupied! - buffer!).toBe(capacity!);
    // Union: 60 anchor + 60 fixed overlapping by 30 = 90 occupied.
    expect(occupied).toBe(90);
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
