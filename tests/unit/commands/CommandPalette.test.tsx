import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandProvider } from '@/components/commands/CommandProvider';
import { ShortcutSheet } from '@/components/commands/ShortcutSheet';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { CAPTURE_EVENT } from '@/lib/commands/events';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
});

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
});

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandProvider />
    </QueryClientProvider>,
  );
}

function openPalette() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  });
}

describe('the command palette', () => {
  it('opens on Ctrl+K, filters as you type and runs the active command', async () => {
    renderProvider();
    openPalette();
    const dialog = await screen.findByRole('dialog', { name: 'Commands' });
    expect(dialog).toBeTruthy();

    const input = screen.getByLabelText('Type a command');
    fireEvent.change(input, { target: { value: 'inbox' } });
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Inbox'),
      expect.stringContaining('Capture a task'),
    ]);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/inbox');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull());
  });

  it('moves the active option with the arrow keys and describes it with aria-activedescendant', async () => {
    renderProvider();
    openPalette();
    const input = await screen.findByLabelText('Type a command');
    const list = screen.getByRole('listbox', { name: 'Commands' });
    expect(list).toBeTruthy();

    const first = screen.getAllByRole('option')[0]!;
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1]!;
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id);
    expect(second.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
  });

  it('says so when nothing matches, and enters inert', async () => {
    renderProvider();
    openPalette();
    const input = await screen.findByLabelText('Type a command');
    fireEvent.change(input, { target: { value: 'zzz-nothing' } });
    expect(screen.getByText('No command matches that.')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).not.toHaveBeenCalled();
  });

  it('does not open while another dialog is on screen, and Escape closes it', async () => {
    renderProvider();
    // A dialog from somewhere else in the app is open.
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.appendChild(other);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull();
    other.remove();

    openPalette();
    expect(await screen.findByRole('dialog', { name: 'Commands' })).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull());
  });

  it('opens from inside a text field (documented decision)', async () => {
    renderProvider();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    openPalette();
    expect(await screen.findByRole('dialog', { name: 'Commands' })).toBeTruthy();
    field.remove();
  });

  it('asks for the capture sheet instead of writing anything itself', async () => {
    renderProvider();
    const capture = vi.fn();
    window.addEventListener(CAPTURE_EVENT, capture);
    openPalette();
    fireEvent.change(await screen.findByLabelText('Type a command'), {
      target: { value: 'capture a task' },
    });
    fireEvent.keyDown(screen.getByLabelText('Type a command'), { key: 'Enter' });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    window.removeEventListener(CAPTURE_EVENT, capture);
  });

  it('hides flag-gated commands when the flag is off', async () => {
    await settingsRepo.setFlag('taskInbox', false);
    renderProvider();
    openPalette();
    fireEvent.change(await screen.findByLabelText('Type a command'), { target: { value: 'inbox' } });
    expect(screen.queryByRole('option')).toBeNull();
    fireEvent.change(screen.getByLabelText('Type a command'), { target: { value: 'sessions' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});

describe('the shortcut sheet', () => {
  it('lists the shortcuts from the same registry the palette runs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ShortcutSheet />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Capture a task')).toBeTruthy();
    expect(screen.getByText(/In the inbox, keys 1–6/)).toBeTruthy();
  });
});
