import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { CaptureSheet } from '@/components/tasks/CaptureSheet';
import { CaptureLauncher } from '@/components/tasks/CaptureLauncher';
import { Modal } from '@/components/ui/Modal';
import { taskRepo as repoForSpy } from '@/lib/db/task.repo';
import { InboxScreen } from '@/components/tasks/InboxScreen';
import { requestCapture } from '@/lib/commands/events';

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

describe('CaptureLauncher stacking and errors', () => {
  it('opens on top of the practice form; Escape closes only the capture sheet', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    function Harness() {
      const [formOpen, setFormOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setFormOpen(true)}>
            Open practice form
          </button>
          <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New session">
            <label htmlFor="practice-note">Practice note</label>
            <input id="practice-note" />
          </Modal>
          <CaptureLauncher />
        </>
      );
    }
    renderWithProviders(<Harness />);

    const opener = await screen.findByRole('button', { name: 'Open practice form' });
    fireEvent.click(opener);
    const practiceDialog = await screen.findByRole('dialog', { name: 'New session' });
    const note = screen.getByLabelText('Practice note') as HTMLInputElement;
    note.focus();
    fireEvent.change(note, { target: { value: 'half typed note' } });

    await screen.findByRole('button', { name: 'Capture a task' });
    requestCapture();
    await screen.findByRole('dialog', { name: 'Capture' });
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'Escape' });

    // The panel keeps role="dialog" while it animates out; under load that can
    // outlast waitFor's 1 s default, so give it room.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Capture' })).toBeNull(), {
      timeout: 3000,
    });
    // The practice form is still there, unmounted nowhere, with its state.
    expect(screen.getByRole('dialog', { name: 'New session' })).toBe(practiceDialog);
    expect(note.value).toBe('half typed note');
    await waitFor(() => expect(document.activeElement).toBe(note));
  });

  it('shows a sentence and keeps the text when a capture write fails', async () => {
    const spy = vi
      .spyOn(repoForSpy, 'create')
      .mockRejectedValue({ issues: [{ message: 'Storage is full.' }] });
    renderWithProviders(<CaptureSheet open onClose={() => {}} />);
    const input = (await screen.findByLabelText('Task to capture')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'fix hose' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Storage is full.');
    expect(alert.textContent ?? '').not.toContain('issues');
    expect(input.value).toBe('fix hose');
    spy.mockRestore();
  });
});

describe('CaptureLauncher', () => {
  it('renders no capture control and listens for nothing while the flag is off', async () => {
    renderWithProviders(<CaptureLauncher />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Capture a task' })).toBeNull());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    requestCapture();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens when the command palette asks for a capture, and not on a bare keydown', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<CaptureLauncher />);

    const button = await screen.findByRole('button', { name: 'Capture a task' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    // The global shortcut belongs to the palette now (W19 part 3); the launcher
    // no longer binds a key of its own.
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();

    requestCapture();
    expect(await screen.findByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
    // And the visible button still opens it directly.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Capture' })).toBeNull());
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
  });
});
