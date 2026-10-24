import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

const applyBlocks = vi.fn(async (_payload: { blocks: { taskId: string }[] }) => undefined);

vi.mock('@/hooks/useTimeline', () => ({
  TIMELINE_STEP_MIN: 15,
  useTimeline: () => ({
    enabled: true,
    dayKey: '2026-06-15',
    window: { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() },
    blocks: [],
    fixedBlocks: [],
    focusBlocks: [],
    anchors: [],
    proposal: {
      blocks: [{ taskId: 't1', start: new Date(2026, 5, 15, 9, 15).getTime(), end: new Date(2026, 5, 15, 9, 45).getTime() }],
      unplaced: [],
    },
  }),
  useFixedBlockMutations: () => ({ createBlock: vi.fn(), updateBlock: vi.fn(), deleteBlock: vi.fn() }),
  useApplyLayout: () => ({ mutateAsync: applyBlocks }),
}));

vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: [{ id: 't1', title: 'Draft the letter', status: 'next' }] }),
}));
vi.mock('@/hooks/usePlanning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePlanning')>()),
  useTodayKey: () => '2026-06-15',
}));

import { TimelineScreen } from '@/components/timeline/TimelineScreen';

afterEach(() => {
  cleanup();
  applyBlocks.mockClear();
});

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

describe('timeline proposal', () => {
  it('shows a proposal as ghosts and writes focus blocks only on Apply', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /propose a layout/i }));
    expect(screen.getByText(/1 focus block proposed/i)).toBeTruthy();
    expect(screen.getByText('Draft the letter')).toBeTruthy();
    expect(applyBlocks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /apply this layout/i }));
    await vi.waitFor(() => expect(applyBlocks).toHaveBeenCalledTimes(1));
    const payload = applyBlocks.mock.calls[0]![0];
    expect(payload.blocks.map((block) => block.taskId)).toEqual(['t1']);
  });

  it('writes nothing when the preview is cancelled', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /propose a layout/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(applyBlocks).not.toHaveBeenCalled();
    expect(screen.queryByText(/focus block proposed/i)).toBeNull();
  });

  it('keeps a single Apply from firing twice', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /propose a layout/i }));
    const apply = screen.getByRole('button', { name: /apply this layout/i });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await vi.waitFor(() => expect(applyBlocks).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(applyBlocks).toHaveBeenCalledTimes(1);
  });
});
