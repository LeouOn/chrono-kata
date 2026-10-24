import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { TodayPlanCard } from '@/components/planning/TodayPlanCard';
import { SessionLauncherProvider } from '@/components/session/SessionLauncher';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCard(openForLink = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionLauncherProvider value={{ openForLink }}>
        <TodayPlanCard />
      </SessionLauncherProvider>
    </QueryClientProvider>,
  );
  return { openForLink, container: view.container };
}

describe('TodayPlanCard', () => {
  it('renders nothing while the flag is off', async () => {
    const task = await taskRepo.create({ title: 'hidden', status: 'next', source: 'manual' });
    await dayPlanRepo.upsert(TODAY, { picks: [task.id], capacityMin: 200 });
    const { container } = renderCard();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('says the day was left unpicked when the saved plan is empty', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await dayPlanRepo.upsert(TODAY, { picks: [], capacityMin: 200 });
    renderCard();
    expect(await screen.findByText(/You left today unpicked\./)).toBeInTheDocument();
    expect(screen.queryByText(/All of today’s picks are done/)).toBeNull();
    expect(screen.queryByText(/Nothing picked yet/)).toBeNull();
    expect(screen.getByText(/Room for 200 minutes today\./)).toBeInTheDocument();
  });

  it('invites a plan when none is confirmed', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    expect(await screen.findByText(/Nothing picked yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Plan your day/i })).toHaveAttribute('href', '/plan');
  });

  it('links to the projects list, beside Timeline and the plan, once the card has loaded', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    expect(await screen.findByText(/Nothing picked yet/)).toBeInTheDocument();
    const projects = screen.getByRole('link', { name: 'Projects' });
    expect(projects).toHaveAttribute('href', '/projects');
    expect(projects.className).toContain('min-h-11'); // a 44px target
    expect(screen.getByRole('link', { name: 'Timeline' })).toHaveAttribute('href', '/timeline');
  });

  it('shows confirmed picks, the capacity line, and starts a linked session', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const task = await taskRepo.create({
      title: 'write the report',
      status: 'next',
      source: 'manual',
      estimateMin: 20,
      nextAction: 'open the outline',
    });
    await dayPlanRepo.upsert(TODAY, { picks: [task.id], capacityMin: 200 });
    const { openForLink } = renderCard();

    expect(await screen.findByText('write the report')).toBeInTheDocument();
    expect(screen.getByText(/Room for 200 minutes today; these picks come to about 20\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start a session for write the report' }));
    expect(openForLink).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, label: 'open the outline', estimateMin: 20 }),
    );
  });

  it('drops a task completed elsewhere without scolding', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const task = await taskRepo.create({ title: 'done task', status: 'next', source: 'manual' });
    await dayPlanRepo.upsert(TODAY, { picks: [task.id], capacityMin: 200 });
    await taskRepo.setStatus(task.id, 'done');

    const { container } = renderCard();
    // Wait until the plan AND tasks queries have resolved, otherwise the
    // loading-state empty card would satisfy the assertion.
    expect(await screen.findByText(/Room for 200 minutes today\./)).toBeInTheDocument();
    expect(await screen.findByText(/All of today’s picks are done\./)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing picked yet/)).toBeNull();
    // The room line appears exactly once.
    expect((container.textContent ?? '').match(/Room for 200 minutes/g)).toHaveLength(1);
    expect(container.textContent ?? '').not.toMatch(/overdue|late\b|behind|missed|failed|should have/i);
    expect(screen.queryByRole('button', { name: /Start a session for done task/ })).toBeNull();
  });
});
