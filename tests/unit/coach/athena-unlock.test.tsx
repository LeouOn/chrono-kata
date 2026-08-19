import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { useAthenaUnlock } from '@/hooks/useAthenaUnlock';
import { getCoachSystemPrompt, ATHENA_SYSTEM_PROMPT } from '@/lib/coaches';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Athena Secret Mode & Unlock Hook', () => {
  beforeEach(async () => {
    await resetDbForTesting();
    // Ensure initial settings exist with default unlocked personalities
    await settingsRepo.get();
  });

  it('provides Athena system prompt via getCoachSystemPrompt', () => {
    const prompt = getCoachSystemPrompt('athena');
    expect(prompt).toBe(ATHENA_SYSTEM_PROMPT);
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('does not unlock Athena with fewer than 7 taps', async () => {
    const onUnlock = vi.fn();
    const { result } = renderHook(() => useAthenaUnlock({ onUnlock }), {
      wrapper: createWrapper(),
    });

    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await result.current.registerTap();
      });
    }

    const settings = await settingsRepo.get();
    expect(settings.unlockedPersonalities).not.toContain('athena');
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('unlocks Athena on the 7th rapid tap and calls onUnlock', async () => {
    const onUnlock = vi.fn();
    const { result } = renderHook(() => useAthenaUnlock({ onUnlock }), {
      wrapper: createWrapper(),
    });

    for (let i = 0; i < 7; i++) {
      await act(async () => {
        await result.current.registerTap();
      });
    }

    const settings = await settingsRepo.get();
    expect(settings.unlockedPersonalities).toContain('athena');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger unlock or duplicate entry if already unlocked', async () => {
    await settingsRepo.patch({
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy', 'athena'],
    });

    const onUnlock = vi.fn();
    const { result } = renderHook(() => useAthenaUnlock({ onUnlock }), {
      wrapper: createWrapper(),
    });

    for (let i = 0; i < 7; i++) {
      await act(async () => {
        await result.current.registerTap();
      });
    }

    const settings = await settingsRepo.get();
    const athenaOccurrences = settings.unlockedPersonalities.filter((p) => p === 'athena').length;
    expect(athenaOccurrences).toBe(1);
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
