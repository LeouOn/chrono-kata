import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { resetDbForTesting, getDb } from '@/lib/db/db';

const now = Date.now();
const proposed = [
  { taskId: '11111111-1111-4111-8111-111111111111', start: now + 3_600_000, end: now + 5_400_000 },
  { taskId: '22222222-2222-4222-8222-222222222222', start: now + 7_200_000, end: now + 9_000_000 },
];

vi.mock('@/hooks/useTimeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useTimeline')>()),
  TIMELINE_STEP_MIN: 15,
  useTimeline: () => ({
    enabled: true,
    dayKey: '2026-06-15',
    wakingHours: { start: '00:00', end: '23:59' },
    window: { start: now - 3_600_000, end: now + 12 * 3_600_000 },
    blocks: [],
    fixedBlocks: [],
    focusBlocks: [],
    anchors: [],
    proposal: { blocks: proposed, unplaced: [] },
  }),
}));
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useTasks', () => ({ useTasks: () => ({ data: [] }) }));
vi.mock('@/hooks/usePlanning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePlanning')>()),
  useTodayKey: () => new Date().toISOString().slice(0, 10),
}));
vi.mock('@/hooks/useNow', () => ({ useNow: () => now }));

import { TimelineScreen } from '@/components/timeline/TimelineScreen';

beforeEach(async () => {
  await resetDbForTesting();
});
afterEach(cleanup);

describe('applying a proposal', () => {
  it('writes the proposal once even when Apply is clicked twice in one act', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <TimelineScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /propose a layout/i }));
    const apply = screen.getByRole('button', { name: /apply this layout/i });
    await act(async () => {
      fireEvent.click(apply);
      fireEvent.click(apply);
    });
    await waitFor(async () => {
      const db = await getDb();
      const blocks = await db.blocks.toArray();
      expect(blocks).toHaveLength(2);
      expect(blocks.every((block) => block.kind === 'focus')).toBe(true);
    });
    const db = await getDb();
    expect((await db.blocks.toArray()).map((block) => block.taskId).sort()).toEqual(
      proposed.map((block) => block.taskId).sort(),
    );
  });
});
