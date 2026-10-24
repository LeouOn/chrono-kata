import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { Timeline } from '@/components/timeline/Timeline';

const focusBlock = {
  id: 'b1',
  kind: 'focus' as const,
  title: 'Focus',
  taskId: 't1',
  start: new Date(2026, 5, 15, 9, 0),
  end: new Date(2026, 5, 15, 9, 30),
};

vi.mock('@/hooks/useTimeline', () => ({
  TIMELINE_STEP_MIN: 15,
  useTimeline: () => ({
    enabled: true,
    dayKey: '2026-06-15',
    wakingHours: { start: '00:00', end: '23:59' },
    window: { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() },
    blocks: [focusBlock],
    fixedBlocks: [],
    focusBlocks: [focusBlock],
    anchors: [
      {
        id: 'a1',
        title: 'School run',
        start: new Date(2026, 5, 15, 12),
        end: new Date(2026, 5, 15, 13),
        domainId: null,
      },
    ],
    proposal: null,
  }),
  useFixedBlockMutations: () => ({ createBlock: vi.fn(), updateBlock: vi.fn(), deleteBlock: vi.fn() }),
  useApplyLayout: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: [{ id: 't1', title: 'Draft the letter', status: 'next' }] }),
}));
vi.mock('@/hooks/usePlanning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePlanning')>()),
  useTodayKey: () => '2026-06-15',
}));
vi.mock('@/hooks/useNow', () => ({ useNow: () => new Date(2026, 5, 15, 10, 0).getTime() }));

import { TimelineScreen } from '@/components/timeline/TimelineScreen';

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

describe('timeline display', () => {
  it("shows a focus block's task name, not the stored 'Focus' title", () => {
    renderScreen();
    expect(screen.getByRole('button', { name: /focus block Draft the letter 09:00 to 09:30/i })).toBeTruthy();
  });

  it('answers a tap on a protected window with a calm Settings note instead of a sheet', () => {
    renderScreen();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /anchor block School run/i }));
    expect(screen.getByRole('status').textContent).toMatch(/Protected windows are set in .*Settings/i);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('timeline now line', () => {
  const window = { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() };
  it('draws the now line only when now is inside the window', () => {
    const { rerender } = render(<Timeline window={window} blocks={[]} now={window.start - 1} onSelect={() => {}} />);
    expect(screen.queryByLabelText(/^Now /)).toBeNull();
    rerender(<Timeline window={window} blocks={[]} now={window.start + 60 * 60_000} onSelect={() => {}} />);
    expect(screen.getByLabelText('Now 10:00')).toBeTruthy();
    rerender(<Timeline window={window} blocks={[]} now={window.end + 1} onSelect={() => {}} />);
    expect(screen.queryByLabelText(/^Now /)).toBeNull();
  });
});
