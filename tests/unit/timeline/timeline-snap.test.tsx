import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { TimelineScreen } from '@/components/timeline/TimelineScreen';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());
const FIXED_NOW = new Date();
FIXED_NOW.setHours(10, 2, 0, 0);
vi.mock('@/hooks/useNow', () => ({ useNow: () => FIXED_NOW.getTime() }));

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.patch({ wakingHours: { start: '00:00', end: '23:59' } });
  await settingsRepo.setFlag('taskInbox', true);
});
afterEach(cleanup);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TimelineScreen dayKey={TODAY} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('snap step', () => {
  it('changes the proposed start between 15 and 5 minutes', async () => {
    const t1 = await taskRepo.create({ title: 'Write', status: 'next', source: 'manual', estimateMin: 30 });
    await dayPlanRepo.upsert(TODAY, { picks: [t1.id], capacityMin: 120 });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /propose a layout/i }));
    expect(await screen.findByText('10:15–10:45')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Snap 5' }));
    expect(screen.getByRole('button', { name: 'Snap 5' }).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('10:05–10:35')).toBeTruthy();
  });
});
