import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyBriefingCard } from '@/components/dashboard/DailyBriefingCard';
import { resetDbForTesting } from '@/lib/db/db';

afterEach(cleanup);

beforeEach(async () => {
  await resetDbForTesting();
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DailyBriefingCard />
    </QueryClientProvider>,
  );
}

describe('DailyBriefingCard trigger readiness', () => {
  it('disables the Brief-me trigger until the pacing context has resolved, then arms it', async () => {
    renderCard();

    // The pacing context loads from IndexedDB asynchronously; until it lands,
    // generate() would be a silent no-op, so the trigger must be disabled.
    // This line fails on the old behavior, where the button was clickable
    // while the context was still null.
    expect(screen.getByRole('button', { name: /brief me/i })).toBeDisabled();

    // Once the context resolves, the trigger arms.
    await waitFor(() => expect(screen.getByRole('button', { name: /brief me/i })).toBeEnabled());
  });
});
