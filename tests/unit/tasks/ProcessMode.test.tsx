import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { ProcessMode } from '@/components/tasks/ProcessMode';
import { InboxScreen } from '@/components/tasks/InboxScreen';
import { InboxLink } from '@/components/tasks/InboxLink';
import { settingsRepo } from '@/lib/db/settings.repo';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  cleanup();
});

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

async function seed(title: string) {
  return taskRepo.create({ title, status: 'inbox', source: 'manual' });
}

describe('InboxScreen', () => {
  it('lists inbox items with a neutral count and no overdue language', async () => {
    await seed('fix hose');
    await seed('call bank');
    renderWithProviders(<InboxScreen />);

    expect(await screen.findByText('fix hose')).toBeInTheDocument();
    expect(screen.getByText(/2 items to sort/)).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).toBeNull();
    expect(screen.queryByText(/late/i)).toBeNull();
  });

  it('shows a calm empty state', async () => {
    renderWithProviders(<InboxScreen />);
    expect(await screen.findByText('Inbox is clear.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing to sort/)).toBeInTheDocument();
  });
});

describe('ProcessMode', () => {
  it('shows an explicit loading state before the inbox query resolves', async () => {
    renderWithProviders(<ProcessMode open onClose={() => {}} />);
    // First paint, synchronously: never claim "clear" while data is pending.
    expect(screen.getByRole('status')).toHaveTextContent('Loading inbox…');
    expect(screen.queryByText('Inbox is clear.')).toBeNull();
    await waitFor(() => expect(screen.getByText('Inbox is clear.')).toBeInTheDocument());
  });

  it('shows an item captured while process mode is open', async () => {
    await seed('first thing');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ProcessMode open onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('1 of 1')).toBeInTheDocument();

    await taskRepo.create({ title: 'captured mid-session', status: 'inbox', source: 'manual' });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['tasks'] });
    });

    // The queue is derived from the live inbox, so the new item joins it.
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1: Do now/i }));
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
    // The remaining card is whichever item was not just processed.
    expect(screen.getByText(/first thing|captured mid-session/)).toBeInTheDocument();
  });

  it('walks items one at a time and shows neutral progress', async () => {
    await seed('first thing');
    await seed('second thing');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    // Inbox order is newest-touched first, so do not assume which title shows.
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    const firstShown = screen.getByText(/first thing|second thing/).textContent;

    fireEvent.click(screen.getByRole('button', { name: /1: Do now/i }));

    await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
    const nowShown = screen.getByText(/first thing|second thing/).textContent;
    expect(nowShown).not.toBe(firstShown);
    expect(screen.getByText(/1 left after this|0 left after this/)).toBeInTheDocument();
  });

  it('Do now marks the task done and offers an undo', async () => {
    const task = await seed('two minute thing');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /1: Do now/i }));

    await waitFor(async () => expect((await taskRepo.getById(task.id))?.status).toBe('done'));
    const undo = await screen.findByRole('button', { name: /Undo done/i });
    fireEvent.click(undo);
    await waitFor(async () => expect((await taskRepo.getById(task.id))?.status).toBe('inbox'));
  });

  it('Next action asks for the step, then moves it on', async () => {
    const task = await seed('fix hose');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /2: Next action/i }));
    const input = await screen.findByLabelText('The next small step');
    fireEvent.change(input, { target: { value: 'find the spanner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));

    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('next');
      expect(stored?.nextAction).toBe('find the spanner');
    });
  });

  it('Schedule asks for a day and stores it at local midday', async () => {
    const task = await seed('renew domain');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /3: Schedule/i }));
    const input = await screen.findByLabelText('Day to look at it again');
    fireEvent.change(input, { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('scheduled');
      expect(stored?.deferUntil?.getHours()).toBe(12);
      expect(stored?.deferUntil?.getDate()).toBe(24);
    });
  });

  it('Waiting and Drop are one press, and keyboard 1-6 drives it', async () => {
    const waiting = await seed('waiting thing');
    const dropped = await seed('dropped thing');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    await screen.findByText('dropped thing');
    fireEvent.keyDown(window, { key: '4' });
    await waitFor(async () => expect((await taskRepo.getById(dropped.id))?.status).toBe('waiting'));

    fireEvent.keyDown(window, { key: '5' });
    await waitFor(async () => expect((await taskRepo.getById(waiting.id))?.status).toBe('dropped'));
  });

  it('Make project creates a project and links the task', async () => {
    const task = await seed('kitchen renovation');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /6: Make project/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Make project' }));

    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('next');
      expect(stored?.projectId).toBeTruthy();
      const project = await projectRepo.getById(stored!.projectId!);
      expect(project?.title).toBe('kitchen renovation');
    });
  });

  it('Skip leaves the item in the inbox and moves on', async () => {
    const task = await seed('skip me');
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /Skip for now/i }));

    expect(await screen.findByText('Inbox is clear.')).toBeInTheDocument();
    expect((await taskRepo.getById(task.id))?.status).toBe('inbox');
  });

  it('shows a readable sentence when a write fails, never raw validation JSON', async () => {
    await seed('one');
    const spy = vi
      .spyOn(taskRepo, 'setStatus')
      .mockRejectedValue({ issues: [{ message: 'Could not save that task.' }] });
    renderWithProviders(<ProcessMode open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /1: Do now/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not save that task.');
    expect(alert.textContent ?? '').not.toContain('issues');
    expect(alert.textContent ?? '').not.toContain('code');
    spy.mockRestore();
  });

  it('says so when the inbox is empty', async () => {
    renderWithProviders(<ProcessMode open onClose={() => {}} />);
    expect(await screen.findByText('Inbox is clear.')).toBeInTheDocument();
  });
});

describe('InboxLink (Home header entry point)', () => {
  it('does not read the tasks store at all while the flag is off', async () => {
    const spy = vi.spyOn(taskRepo, 'getAll');
    renderWithProviders(<InboxLink />);
    await waitFor(() => expect(screen.queryByRole('link', { name: /Inbox/i })).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders nothing while the flag is off', async () => {
    await seed('hidden');
    renderWithProviders(<InboxLink />);
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Inbox/i })).toBeNull();
    });
  });

  it('shows a neutral count when the flag is on', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seed('one');
    await seed('two');
    renderWithProviders(<InboxLink />);

    const link = await screen.findByRole('link', { name: /Inbox, 2 items to sort/i });
    expect(link).toHaveAttribute('href', '/inbox');
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
