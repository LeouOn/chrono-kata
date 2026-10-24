import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandProvider } from '@/components/commands/CommandProvider';
import { CaptureLauncher } from '@/components/tasks/CaptureLauncher';
import { ToastProvider } from '@/components/ui/Toast';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

/**
 * The path that used to be one keystroke, end to end: the registry routes the
 * palette's capture command to the launcher, and the launcher opens the same
 * sheet its button opens. Two keystrokes plus the query now — Ctrl+K, type
 * "capture", Enter — or the button, which stays one click.
 */
beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBoth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CommandProvider />
        <CaptureLauncher />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('the palette-to-capture path', () => {
  it('Ctrl+K, type "capture", Enter opens the capture sheet and closes the palette', async () => {
    renderBoth();
    await screen.findByRole('button', { name: 'Capture a task' });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    expect(await screen.findByRole('dialog', { name: 'Commands' })).toBeInTheDocument();

    const search = screen.getByLabelText('Type a command');
    fireEvent.change(search, { target: { value: 'capture' } });
    // Ranking puts the capture command first even though "Inbox" also matches.
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('Capture a task');

    fireEvent.keyDown(search, { key: 'Enter' });

    // The capture sheet is the open dialog and the palette is gone: exactly one.
    expect(await screen.findByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByLabelText('Task to capture')).toBeInTheDocument();
  });

  it('needs no query: arrows alone reach the capture command', async () => {
    renderBoth();
    await screen.findByRole('button', { name: 'Capture a task' });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    const search = await screen.findByLabelText('Type a command');
    const options = screen.getAllByRole('option');
    const target = options.findIndex((option) => option.textContent?.startsWith('Capture a task'));
    expect(target).toBeGreaterThan(0);
    for (let i = 0; i < target; i += 1) fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search.getAttribute('aria-activedescendant')).toBe(options[target]!.id);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Capture' })).toBeInTheDocument();
  });
});
