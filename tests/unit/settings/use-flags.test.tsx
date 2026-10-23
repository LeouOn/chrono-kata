import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { useFlag, useFlags } from '@/hooks/useFlags';

beforeEach(async () => {
  await resetDbForTesting();
});

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useFlag / useFlags', () => {
  it('reads the default when no flag is set', async () => {
    const { result } = renderHook(() => useFlag('sync'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('reads a stored flag', async () => {
    await settingsRepo.setFlag('sync', true);

    const { result } = renderHook(() => useFlag('sync'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('writes a flag and keeps the others', async () => {
    const { result } = renderHook(() => useFlags(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.flags).toBeDefined());

    await act(async () => {
      await result.current.setFlag('privateMode', true);
    });
    await act(async () => {
      await result.current.setFlag('sync', true);
    });

    await waitFor(() =>
      expect(result.current.flags).toEqual({ privateMode: true, sync: true }),
    );
    const stored = await settingsRepo.get();
    expect(stored.flags).toEqual({ privateMode: true, sync: true });
  });
});
