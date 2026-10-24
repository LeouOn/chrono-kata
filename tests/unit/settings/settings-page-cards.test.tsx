/**
 * The Settings page after #44 (calendar interop) and #46 (error log) were both
 * merged into it. Each card is behind the `taskInbox` preview flag:
 *
 * - flag ON: both cards render side by side, and each reads its own data;
 * - flag OFF: neither renders, and neither has touched its data - no
 *   localStorage read for the error log, no block query for the calendar card.
 *
 * "Flag off is inert" is asserted AFTER everything has settled (no query still
 * in flight), so a read that merely had not happened yet cannot pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '@/app/(main)/settings/page';
import { ToastProvider } from '@/components/ui/Toast';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { ERROR_LOG_KEY } from '@/lib/errors/error-log';

function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

/** The page is up and nothing is still loading. */
async function settled(queryClient: QueryClient) {
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
  expect(await screen.findByText('Tasks and inbox (preview)')).toBeTruthy();
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

const errorLogReads = (spy: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }) =>
  spy.mock.calls.filter(([key]) => key === ERROR_LOG_KEY);

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  // jsdom has no matchMedia; the PWA-install card on this page asks for it.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  await resetDbForTesting();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('Settings page: calendar interop and error log cards', () => {
  it('flag OFF: neither card renders and neither reads its data', async () => {
    const blocks = vi.spyOn(blockRepo, 'getAll');
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    expect((await settingsRepo.get()).flags?.taskInbox ?? false).toBe(false);

    const { queryClient } = mountPage();
    await settled(queryClient);

    expect(screen.queryByRole('button', { name: 'Export today' })).toBeNull(); // calendar card
    expect(screen.queryByRole('heading', { name: 'Error log' })).toBeNull(); // error log card
    expect(blocks).not.toHaveBeenCalled();
    expect(errorLogReads(storageRead)).toHaveLength(0);
  });

  it('flag ON: both cards render together, each reading its own data', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const blocks = vi.spyOn(blockRepo, 'getAll');
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');

    const { queryClient } = mountPage();
    await settled(queryClient);

    expect(await screen.findByRole('button', { name: 'Export today' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Error log' })).toBeTruthy();
    expect(blocks).toHaveBeenCalled();
    expect(errorLogReads(storageRead).length).toBeGreaterThan(0);
  });

  it('turning the flag back off removes both cards again', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { queryClient } = mountPage();
    await settled(queryClient);
    expect(await screen.findByRole('heading', { name: 'Error log' })).toBeTruthy();

    await settingsRepo.setFlag('taskInbox', false);
    await queryClient.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Error log' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Export today' })).toBeNull();
  });
});
