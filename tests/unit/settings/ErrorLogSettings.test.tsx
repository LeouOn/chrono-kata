import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { ErrorLogSettings } from '@/components/settings/ErrorLogSettings';

type Entry = import('@/lib/errors/error-log').ErrorLogEntry;
const getErrorLog = vi.hoisted(() => vi.fn((): Entry[] => []));

vi.mock('@/lib/errors/error-log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/errors/error-log')>()),
  getErrorLog: getErrorLog,
}));

function ui() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ErrorLogSettings />
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  cleanup();
  vi.clearAllMocks();
  getErrorLog.mockReturnValue([]);
  await resetDbForTesting();
});

describe('ErrorLogSettings flag inertness', () => {
  it('renders NOTHING and touches NO storage while the preview flag is off', async () => {
    const settings = await settingsRepo.get();
    expect(settings.flags?.taskInbox ?? false).toBe(false); // default off

    const { container } = ui();
    // Give the flag query a beat to resolve.
    await new Promise((r) => setTimeout(r, 50));

    expect(container.querySelector('[aria-label="Error log"]')).toBeNull();
    expect(screen.queryByText('Error log')).toBeNull();
    // Spy proof of inertness: no log read ever happened.
    expect(getErrorLog).not.toHaveBeenCalled();
  });

  it('renders the card and reads the log once the flag is on', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    ui();
    await new Promise((r) => setTimeout(r, 50));
    expect(await screen.findByRole('heading', { name: 'Error log' })).toBeTruthy();
    expect(getErrorLog).toHaveBeenCalled();
    expect(screen.getByText('Nothing recorded.')).toBeTruthy();
  });
});

describe('ErrorLogSettings export note', () => {
  const NOTE = 'Entries can include short fragments of your own text. Read them before you share the file.';
  const entry: Entry = {
    at: Date.UTC(2026, 9, 24, 9, 0),
    route: '/inbox',
    name: 'TypeError',
    message: 'could not render "Call the bank"',
    messageTruncated: false,
    stack: '',
  };

  it('says entries can hold the user\'s own text, and ties the line to Export', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    getErrorLog.mockReturnValue([entry]);
    ui();
    expect(await screen.findByText(NOTE)).toBeTruthy();
    // aria-describedby: a screen reader reads the warning with the button.
    expect(screen.getByRole('button', { name: 'Export error log', description: NOTE })).toBeTruthy();
  });

  it('is honest that a short message is stored whole: the card shows it as recorded', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    getErrorLog.mockReturnValue([entry]);
    ui();
    expect(await screen.findByText(/Call the bank/)).toBeTruthy();
    expect(screen.queryByText(/\(trimmed\)/)).toBeNull();
  });

  it('shows no export line when there is nothing to export', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    ui();
    expect(await screen.findByText('Nothing recorded.')).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Export error log' }).hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ErrorLogSettings button names', () => {
  it('each button names what it acts on, and the visible text is the name', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    getErrorLog.mockReturnValue([
      { at: 1, route: '/inbox', name: 'Error', message: 'x', messageTruncated: false, stack: '' },
    ]);
    ui();
    for (const name of ['Export error log', 'Reload error log', 'Clear error log']) {
      const button = await screen.findByRole('button', { name });
      expect(button.textContent).toBe(name); // WCAG 2.5.3: nothing hidden in an aria-label
    }
  });
});
