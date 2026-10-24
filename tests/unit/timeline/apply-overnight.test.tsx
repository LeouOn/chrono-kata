import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { resetDbForTesting } from '@/lib/db/db';
import { blockRepo } from '@/lib/db/block.repo';
import { useApplyLayout } from '@/hooks/useTimeline';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());
const TASK = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await resetDbForTesting();
});
afterEach(() => {});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('apply on an overnight window', () => {
  it('replaces a future after-midnight focus block instead of duplicating the task', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 30, 0, 0);
    const old = await blockRepo.create({
      start: tomorrow,
      end: new Date(tomorrow.getTime() + 3_600_000),
      kind: 'focus',
      title: 'Focus',
      taskId: TASK,
    });
    const { result } = renderHook(() => useApplyLayout(TODAY, { start: '20:00', end: '02:00' }), { wrapper });
    const today = new Date();
    today.setHours(20, 30, 0, 0);
    await result.current.mutateAsync({
      blocks: [{ taskId: TASK, start: today.getTime(), end: today.getTime() + 3_600_000 }],
    });
    await waitFor(async () => {
      const blocks = await blockRepo.range(new Date(Date.now() - 24 * 3_600_000), new Date(Date.now() + 48 * 3_600_000));
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.id).not.toBe(old.id);
      expect(blocks[0]!.start.getHours()).toBe(20);
    });
  });
});
