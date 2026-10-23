import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyBriefingCard } from '@/components/dashboard/DailyBriefingCard';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { resetDbForTesting } from '@/lib/db/db';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

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

  it("shows 'Could not load today\u2019s pacing data' when the context load fails, instead of a dead button", async () => {
    // check-m's FU8 repro: a failing IndexedDB read must surface a message,
    // not leave the trigger disabled forever with no explanation (and no
    // unhandled rejection). Fails without the try/catch in usePacingContext.
    vi.spyOn(checkInRepo, 'getAll').mockRejectedValue(new Error('IndexedDB unavailable'));

    renderCard();

    await waitFor(() =>
      expect(screen.getByText("Could not load today's pacing data")).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /brief me/i })).toBeDisabled();
  });
});
