import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { ErrorLogSettings } from '@/components/settings/ErrorLogSettings';

const getErrorLog = vi.hoisted(() => vi.fn(() => []));

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
