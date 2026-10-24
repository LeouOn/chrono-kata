/**
 * The gentle offer on Home and the plan screen (roadmap Wave 10, part 3).
 *
 * Asserted after the data has arrived; `Date` is pinned (timers stay real so
 * IndexedDB and react-query run) and moved by hand to test "the next day".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { ReviveCard } from '@/components/projects/ReviveCard';
import { SessionLauncherProvider } from '@/components/session/SessionLauncher';
import { REVIVE_STORAGE_KEY } from '@/lib/planning/revive-store';
import { GUILT } from '../planning/w10-helpers';
import { expectNamedControls } from './helpers';

const NOW = new Date(2026, 5, 17, 10, 0);
const at = (daysBack: number, hour = 9) => new Date(2026, 5, 17 - daysBack, hour, 0);
const openForLink = vi.fn();

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  openForLink.mockClear();
  await resetDbForTesting();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionLauncherProvider value={{ openForLink }}>
        <ReviveCard />
      </SessionLauncherProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

async function quietProject(title: string, daysQuiet: number, extra: Record<string, unknown> = {}) {
  const project = await projectRepo.create({ title, status: 'active', ...extra });
  await getDb().projects.put({ ...project, lastTouchedAt: at(daysQuiet) });
  return project;
}

describe('flag OFF', () => {
  it('renders nothing and reads nothing, asserted after everything has settled', async () => {
    await quietProject('Write the novel', 20);
    const reads = [vi.spyOn(projectRepo, 'getAll'), vi.spyOn(taskRepo, 'getAll')];
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    expect((await settingsRepo.get()).flags?.taskInbox ?? false).toBe(false);

    const { client, container } = mount();
    await waitFor(() => expect(client.isFetching()).toBe(0)); // the flag has arrived
    expect(container).toBeEmptyDOMElement();
    for (const read of reads) expect(read).not.toHaveBeenCalled();
    expect(storage.mock.calls.filter(([key]) => key === REVIVE_STORAGE_KEY)).toHaveLength(0);
  });
});

describe('flag ON', () => {
  beforeEach(async () => {
    await settingsRepo.setFlag('taskInbox', true);
  });

  it('offers one quiet project calmly, with its note and three named controls', async () => {
    const project = await quietProject('Write the novel', 20);
    const task = await taskRepo.create({ title: 'Draft the storm', status: 'next', projectId: project.id, source: 'manual' });
    await sessionRepo.save({ startedAt: at(20), durationMinutes: 25, reps: null, rating: 3, taskId: task.id, breadcrumb: 'Pick up at the lighthouse' } as Parameters<typeof sessionRepo.save>[0]);

    const { container } = mount();
    expect(await screen.findByText('Write the novel')).toBeTruthy();
    expect(screen.getByText(/Worked on 2 weeks ago\. Ten minutes is enough to keep it going\./)).toBeTruthy();
    expect(screen.getByText('Pick up here: Pick up at the lighthouse')).toBeTruthy();
    expect(container.textContent).not.toMatch(GUILT);
    expect(container.textContent).not.toMatch(/stall|overdue|neglect/i);

    expect(screen.getByRole('button', { name: 'Start 10 minutes on Write the novel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open project' }).getAttribute('href')).toBe(`/projects/detail?id=${project.id}`);
    expectNamedControls(container);
    for (const control of [...screen.getAllByRole('button'), screen.getByRole('link')]) {
      expect(control.className, control.textContent ?? '').toContain('min-h-11');
    }
  });

  it('starts the ten-minute session through the existing launcher, and offers nothing else to do', async () => {
    const project = await quietProject('Write the novel', 20);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Start 10 minutes/ }));
    expect(openForLink).toHaveBeenCalledTimes(1);
    expect(openForLink).toHaveBeenCalledWith({ projectId: project.id, label: 'Write the novel', estimateMin: 10 });
  });

  it('offers nothing for a project that is not quiet', async () => {
    await quietProject('Fresh', 2);
    const { client, container } = mount();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it('"Not now" puts it aside: gone now, gone after a reload, back after three days', async () => {
    await quietProject('Write the novel', 20);
    const first = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(first.container).toBeEmptyDOMElement());
    expect(JSON.parse(localStorage.getItem(REVIVE_STORAGE_KEY)!)).toMatchObject({ quietDay: '2026-06-17' });

    // Same day, fresh mount (a reload): still put aside.
    first.unmount();
    const again = mount();
    await waitFor(() => expect(again.client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(again.container).toBeEmptyDOMElement();

    // Two days later: still resting. Three days later: offered again.
    for (const [daysLater, shown] of [[1, false], [2, false], [3, true]] as const) {
      again.unmount();
      vi.setSystemTime(new Date(2026, 5, 17 + daysLater, 10, 0));
      const view = mount();
      if (shown) {
        expect(await screen.findByText('Write the novel')).toBeTruthy();
      } else {
        await waitFor(() => expect(view.client.isFetching()).toBe(0));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(view.container).toBeEmptyDOMElement();
      }
      view.unmount();
    }
  });

  it('puts one aside and offers no other the same day, then the next the next day', async () => {
    await quietProject('Most recent', 10);
    await quietProject('Older', 25);
    const day1 = mount();
    expect(await screen.findByText('Most recent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(day1.container).toBeEmptyDOMElement());
    day1.unmount();

    vi.setSystemTime(new Date(2026, 5, 18, 10, 0));
    const day2 = mount();
    expect(await screen.findByText('Older')).toBeTruthy(); // "Most recent" is resting; today is a new day
    expect(screen.queryByText('Most recent')).toBeNull();
  });

  it('still works when the browser refuses to remember (private window, full disk)', async () => {
    await quietProject('Write the novel', 20);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(view.container).toBeEmptyDOMElement()); // put aside for this visit
  });
});
