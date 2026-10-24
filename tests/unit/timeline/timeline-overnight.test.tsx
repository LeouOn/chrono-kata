import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { toLocalDateString } from '@/lib/utils/date';

const DAY = toLocalDateString(new Date());
const start = new Date();
start.setHours(20, 0, 0, 0);
const end = new Date(start.getTime() + 6 * 3_600_000);

vi.mock('@/hooks/useTimeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useTimeline')>()),
  TIMELINE_STEP_MIN: 15,
  useTimeline: () => ({
    enabled: true,
    dayKey: DAY,
    wakingHours: { start: '00:00', end: '23:59' },
    window: { start: start.getTime(), end: end.getTime() },
    blocks: [],
    fixedBlocks: [],
    focusBlocks: [],
    anchors: [],
    proposal: null,
  }),
}));
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useTasks', () => ({ useTasks: () => ({ data: [] }) }));
vi.mock('@/hooks/usePlanning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePlanning')>()),
  useTodayKey: () => DAY,
}));
vi.mock('@/hooks/useNow', () => ({ useNow: () => new Date(2026, 5, 15, 22, 0).getTime() }));

import { TimelineScreen } from '@/components/timeline/TimelineScreen';

beforeEach(async () => {
  await resetDbForTesting();
});
afterEach(cleanup);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TimelineScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('overnight commitment sheet', () => {
  it('places an after-midnight clock on the next calendar day', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /add a commitment/i }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Late call' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '00:30' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '01:30' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    await waitFor(async () => {
      const db = await getDb();
      const blocks = await db.blocks.filter((block) => block.title === 'Late call').toArray();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.start.getDate()).toBe(start.getDate() + 1);
      expect(blocks[0]!.start.getHours()).toBe(0);
      expect(blocks[0]!.start.getMinutes()).toBe(30);
    });
  });

  it('accepts 23:00-01:00 instead of refusing the end as earlier than the start', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /add a commitment/i }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Night shift' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '23:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '01:00' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    await waitFor(async () => {
      const db = await getDb();
      const blocks = await db.blocks.filter((block) => block.title === 'Night shift').toArray();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.end.getTime() - blocks[0]!.start.getTime()).toBe(2 * 3_600_000);
      expect(blocks[0]!.end.getDate()).toBe(blocks[0]!.start.getDate() + 1);
    });
  });
});
