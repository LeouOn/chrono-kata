import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivateModeCard } from '@/components/llm/PrivateModeCard';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDbForTesting();
});

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivateModeCard />
    </QueryClientProvider>,
  );
}

describe('PrivateModeCard', () => {
  it('starts switched off', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
  });

  it('turns private mode on and stores the flag', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(async () => {
      const settings = await settingsRepo.get();
      expect(settings.flags?.privateMode).toBe(true);
    });
  });

  it('says what private mode does not cover', async () => {
    const { container } = renderCard();
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());

    const text = container.textContent ?? '';
    // The honest part: other traffic is not covered, and the redirect case is named.
    expect(text).toContain('does not cover other traffic');
    expect(text).toContain('Google Calendar sync');
    expect(text).toContain('an export still writes a file');
    expect(text).toContain('redirect');
  });
});
