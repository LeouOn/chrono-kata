import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { CaptureSheet } from '@/components/tasks/CaptureSheet';
import { CaptureLauncher } from '@/components/tasks/CaptureLauncher';
import { InboxScreen } from '@/components/tasks/InboxScreen';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => cleanup());

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

const paste = (text: string) => ({ clipboardData: { getData: () => text } });

describe('CaptureSheet', () => {
  it('saves the parsed task and keeps the field ready for the next one', async () => {
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = await screen.findByLabelText('Task to capture');

    fireEvent.change(input, { target: { value: 'fix hose #life ~20m !high tomorrow @hardware-store' } });
    // Chips show what was understood before saving.
    expect(await screen.findByText('Life admin')).toBeInTheDocument();
    expect(screen.getByText('~20m')).toBeInTheDocument();
    expect(screen.getByText('high energy')).toBeInTheDocument();
    expect(screen.getByText('@hardware-store')).toBeInTheDocument();

    fireEvent.submit(input.closest('form')!);

    await waitFor(async () => {
      const tasks = await getDb().tasks.toArray();
      expect(tasks).toHaveLength(1);
      const task = tasks[0]!;
      expect(task.title).toBe('fix hose');
      expect(task.status).toBe('inbox');
      expect(task.estimateMin).toBe(20);
      expect(task.energy).toBe('high');
      expect(task.context).toEqual(['hardware-store']);
      expect(task.deferUntil).toBeInstanceOf(Date);
    });

    // Still open, cleared, focused for the next line.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('does not save an empty line', async () => {
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = await screen.findByLabelText('Task to capture');
    fireEvent.submit(input.closest('form')!);
    await Promise.resolve();
    expect(await getDb().tasks.count()).toBe(0);
  });

  it('keeps unknown tags in the title', async () => {
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = await screen.findByLabelText('Task to capture');
    fireEvent.change(input, { target: { value: 'fix #garden hose' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(async () => expect(await getDb().tasks.count()).toBe(1));
    const task = (await getDb().tasks.toArray())[0]!;
    expect(task.title).toBe('fix #garden hose');
  });

  it('shows a preview for a multi-line paste and saves nothing before Add', async () => {
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = await screen.findByLabelText('Task to capture');

    fireEvent.paste(input, paste('- fix hose\n- buy paint @shop\n* call bank'));

    expect(await screen.findByText(/3 lines found/)).toBeInTheDocument();
    expect(await getDb().tasks.count()).toBe(0);

    // Edit one row, drop another, then add the rest.
    const firstRow = screen.getByLabelText('Line 1') as HTMLInputElement;
    fireEvent.change(firstRow, { target: { value: 'fix the hose properly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drop line 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2' }));

    await waitFor(async () => expect(await getDb().tasks.count()).toBe(2));
    const titles = (await getDb().tasks.toArray()).map((task) => task.title).sort();
    expect(titles).toEqual(['buy paint', 'fix the hose properly']);
  });

  it('cancels a preview without saving', async () => {
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = await screen.findByLabelText('Task to capture');
    fireEvent.paste(input, paste('- one\n- two'));
    await screen.findByText(/2 lines found/);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await getDb().tasks.count()).toBe(0);
  });
});

describe('InlineCapture on the inbox screen', () => {
  it('adds a task from the inbox without leaving the list', async () => {
    renderWithProviders(<InboxScreen />);
    const input = await screen.findByLabelText('Add a task');
    fireEvent.change(input, { target: { value: 'renew domain ~15m !low' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(async () => expect(await getDb().tasks.count()).toBe(1));
    const task = (await getDb().tasks.toArray())[0]!;
    expect(task.title).toBe('renew domain');
    expect(task.estimateMin).toBe(15);
    expect(task.energy).toBe('low');
    expect(await screen.findByText('renew domain')).toBeInTheDocument();
  });

  it('exposes Process as disabled when the inbox is empty', async () => {
    renderWithProviders(<InboxScreen />);
    const process = await screen.findByRole('button', { name: 'Process' });
    expect(process).toBeDisabled();
    expect(process).toHaveAttribute('disabled');

    // Adding through the inline form (same query cache) flips it on.
    const addInput = await screen.findByLabelText('Add a task');
    fireEvent.change(addInput, { target: { value: 'something' } });
    fireEvent.submit(addInput.closest('form')!);
    await waitFor(async () => expect(await screen.findByRole('button', { name: 'Process' })).toBeEnabled());
  });
});

describe('CaptureLauncher', () => {
  it('renders no capture control while the flag is off', async () => {
    renderWithProviders(<CaptureLauncher />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Capture a task' })).toBeNull());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the sheet with Ctrl/Cmd+K when the flag is on', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<CaptureLauncher />);

    const button = await screen.findByRole('button', { name: 'Capture a task' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
  });
});
