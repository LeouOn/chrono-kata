import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MorningCheckIn } from '@/components/checkin/MorningCheckIn';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { toLocalDateString } from '@/lib/utils/date';

afterEach(cleanup);

beforeEach(async () => {
  await resetDbForTesting();
});

function renderCheckIn() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MorningCheckIn />
    </QueryClientProvider>,
  );
}

async function tap(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }));
}

describe('MorningCheckIn', () => {
  it('saves four taps, collapses, and edits the same day', async () => {
    renderCheckIn();
    await tap(/^Energy 4$/);
    await tap(/^Fog 2$/);
    await tap(/^Aches 1$/);
    await tap(/^Sleep 5$/);

    const date = toLocalDateString(new Date());
    await waitFor(async () => {
      const saved = await checkInRepo.getByDate(date);
      expect(saved?.energy).toBe(4);
      expect(saved?.sleep).toBe(5);
    });

    const summary = await screen.findByRole('button', { name: /Energy 4/ });
    expect(summary).toHaveTextContent('Fog 2');

    fireEvent.click(summary);
    fireEvent.click(await screen.findByRole('button', { name: /^Energy 2$/ }));

    await waitFor(async () => {
      const saved = await checkInRepo.getByDate(date);
      expect(saved?.energy).toBe(2);
      const all = await checkInRepo.getAll();
      expect(all).toHaveLength(1);
    });
    expect(await screen.findByRole('button', { name: /Energy 2/ })).toBeTruthy();
  });
});
