import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LLMPage from '@/app/(main)/llm/page';
import { resetDbForTesting } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { resetLLMAppStateReader, setLLMAppStateReader } from '@/lib/llm/app-state';

afterEach(() => {
  cleanup();
  resetLLMAppStateReader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LLMPage />
    </QueryClientProvider>,
  );
}

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/api/local-ai')) {
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ providers: {} }) } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const cloudProvider = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-test',
  credentialSource: 'browser' as const,
};

describe('the LLM tab in private mode', () => {
  it('refuses to test a cloud connection while private mode is on', async () => {
    await llmSettingsRepo.addProvider('openai', cloudProvider);
    // The page reads the flag from the settings row, like the service does.
    await settingsRepo.setFlag('privateMode', true);
    const fetchMock = stubFetch();

    renderPage();

    const testButton = await screen.findByRole('button', { name: 'Test connection' });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Private mode is on/i);
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.includes('api.openai.com'))).toEqual([]);
  });

  it('still tests a local connection while private mode is on', async () => {
    await llmSettingsRepo.addProvider('lmstudio', {
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: '',
      credentialSource: 'browser',
    });
    await settingsRepo.setFlag('privateMode', true);
    const fetchMock = stubFetch();

    renderPage();

    const testButton = await screen.findByRole('button', { name: 'Test connection' });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/lmstudio: connected/i);
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('localhost:1234'))).toBe(true);
  });
});
