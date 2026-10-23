import { describe, it, expect, vi, afterEach } from 'vitest';
import { suggestLabel } from '@/lib/llm/llm-service';
import { createLLMProvider } from '@/lib/llm/provider-factory';
import { resetLLMAppStateReader, setLLMAppStateReader } from '@/lib/llm/app-state';
import { LLMExceptionKind } from '@/lib/llm/types';
import type { LLMSettings } from '@/lib/schemas/llm-settings';

afterEach(() => {
  resetLLMAppStateReader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const cloudEntry = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-test',
  credentialSource: 'browser' as const,
};

const localEntry = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'local-model',
  apiKey: '',
  credentialSource: 'browser' as const,
};

function llmSettings(providers: Record<string, typeof cloudEntry>, active = Object.keys(providers)[0] ?? ''): LLMSettings {
  return {
    id: 'singleton',
    activeProviderName: active,
    providers,
    totalTokensThisMonth: 0,
    totalTokensResetAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  };
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ choices: [{ message: { content: 'walking' } }] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('private mode', () => {
  it('refuses a cloud provider before any request is made', async () => {
    setLLMAppStateReader(async () => ({ privateMode: true }));
    const fetchMock = stubFetch();

    const error = await suggestLabel({ note: 'evening walk', llmSettings: llmSettings({ openai: cloudEntry }) })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as { kind?: string }).kind).toBe(LLMExceptionKind.PrivacyBlocked);
    expect((error as Error).message).toContain('Private mode is on');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a local provider through', async () => {
    setLLMAppStateReader(async () => ({ privateMode: true }));
    const fetchMock = stubFetch();

    const label = await suggestLabel({ note: 'evening walk', llmSettings: llmSettings({ lmstudio: localEntry }) });

    expect(label).toBe('walking');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('localhost:1234');
  });

  it('leaves cloud providers alone when private mode is off', async () => {
    setLLMAppStateReader(async () => ({ privateMode: false }));
    const fetchMock = stubFetch();

    await suggestLabel({ note: 'evening walk', llmSettings: llmSettings({ openai: cloudEntry }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.openai.com');
  });

  it('refuses a cloud provider in the provider factory too', () => {
    expect(() =>
      createLLMProvider(
        { providerName: 'openai', baseUrl: cloudEntry.baseUrl, apiKey: 'k', model: 'm' },
        { privateMode: true },
      ),
    ).toThrow(/Private mode is on/);
  });

  it('refuses a local preset that was pointed at a cloud address', async () => {
    // The preset name is a label, not a promise: "lmstudio" with a public base
    // URL is a request to a public host and must be refused.
    setLLMAppStateReader(async () => ({ privateMode: true }));
    const fetchMock = stubFetch();

    await expect(
      suggestLabel({
        note: 'evening walk',
        llmSettings: llmSettings({ lmstudio: { ...cloudEntry } }),
      }),
    ).rejects.toThrow(/Private mode is on/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a local provider in the provider factory', () => {
    expect(() =>
      createLLMProvider(
        { providerName: 'lmstudio', baseUrl: localEntry.baseUrl, apiKey: '', model: 'm' },
        { privateMode: true },
      ),
    ).not.toThrow();
  });
});
