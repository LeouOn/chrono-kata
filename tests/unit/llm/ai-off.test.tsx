import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { useSessions } from '@/hooks/useSessions';
import { resetLLMAppStateReader, setLLMAppStateReader } from '@/lib/llm/app-state';
import type { SessionInput } from '@/lib/schemas/session';

afterEach(() => {
  resetLLMAppStateReader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
});

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const sessionInput: SessionInput = {
  startedAt: new Date('2026-10-23T09:00:00Z'),
  durationMinutes: 20,
  reps: null,
  rating: 4,
  activityLabel: 'Zazen',
};

describe('AI-off and offline behaviour', () => {
  it('saves a session without touching the network when no provider is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await llmSettingsRepo.get(); // a settings row with no providers

    const { result } = renderHook(() => useSessions(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.createSession(sessionInput);
    });

    await waitFor(async () => {
      expect(await sessionRepo.getAll()).toHaveLength(1);
    });
    // Give the fire-and-forget side effects a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Nothing was sent to a provider. The only call that may happen is the
    // loopback discovery request to this app's own /api/local-ai route.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => !url.includes('/api/local-ai'))).toEqual([]);
  });

  it('still saves the session when private mode refuses the coach request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await llmSettingsRepo.addProvider('openai', {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      credentialSource: 'browser',
    });
    setLLMAppStateReader(async () => ({ privateMode: true }));
    await settingsRepo.get();

    const { result } = renderHook(() => useSessions(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.createSession(sessionInput);
    });

    await waitFor(async () => {
      expect(await sessionRepo.getAll()).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The practice loop worked; nothing was sent to a provider.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => !url.includes('/api/local-ai'))).toEqual([]);
  });
});
