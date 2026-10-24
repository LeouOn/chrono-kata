import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalPageClient } from '@/app/(main)/journal/journal-client';
import { resetDbForTesting } from '@/lib/db/db';
import { journalRepo } from '@/lib/db/journal.repo';
import { settingsRepo } from '@/lib/db/settings.repo';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockClear();
});

beforeEach(async () => {
  await resetDbForTesting();
});

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <JournalPageClient />
    </QueryClientProvider>,
  );
}

describe('the /journal route behind the flag', () => {
  it('renders nothing, reads no journal and sends the user home with the flag off', async () => {
    await settingsRepo.setFlag('taskInbox', false);
    const findByDate = vi.spyOn(journalRepo, 'findByDate');
    const listAll = vi.spyOn(journalRepo, 'listAll');

    const view = renderGate();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    // Nothing of the journal screen is in the page - so neither the export card
    // nor the search card can be reached.
    expect(view.container.textContent).toBe('');
    expect(screen.queryByRole('heading', { name: 'Journal' })).toBeNull();
    expect(screen.queryByLabelText('Search the journal')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download markdown' })).toBeNull();
    // And the flag-off page does not even read the store.
    expect(findByDate).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it('renders the journal, export and search with the flag on', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Journal', level: 1 })).toBeTruthy();
    expect(await screen.findByLabelText('Search the journal')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Download markdown' })).toBeTruthy();
  });
});
