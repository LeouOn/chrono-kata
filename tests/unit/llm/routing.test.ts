import { describe, it, expect, vi, afterEach } from 'vitest';
import { suggestLabel } from '@/lib/llm/llm-service';
import { resetLLMAppStateReader, setLLMAppStateReader } from '@/lib/llm/app-state';
import type { LLMSettings } from '@/lib/schemas/llm-settings';

afterEach(() => {
  resetLLMAppStateReader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const cloud = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-test',
  credentialSource: 'browser' as const,
};

const local = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'local-model',
  apiKey: '',
  credentialSource: 'browser' as const,
};

function llmSettings(active = 'openai'): LLMSettings {
  return {
    id: 'singleton',
    activeProviderName: active,
    providers: { openai: cloud, lmstudio: local },
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

describe('per-feature provider routing', () => {
  it('sends a feature to its routed provider', async () => {
    setLLMAppStateReader(async () => ({
      privateMode: false,
      routing: { features: { labelSuggestion: 'lmstudio' } },
    }));
    const fetchMock = stubFetch();

    await suggestLabel({ note: 'evening walk', llmSettings: llmSettings('openai') });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('localhost:1234');
  });

  it('uses the routing default for a feature with no entry', async () => {
    setLLMAppStateReader(async () => ({
      privateMode: false,
      routing: { default: 'lmstudio' },
    }));
    const fetchMock = stubFetch();

    await suggestLabel({ note: 'evening walk', llmSettings: llmSettings('openai') });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('localhost:1234');
  });

  it('falls back to the active provider when nothing is routed', async () => {
    setLLMAppStateReader(async () => ({ privateMode: false }));
    const fetchMock = stubFetch();

    await suggestLabel({ note: 'evening walk', llmSettings: llmSettings('openai') });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.openai.com');
  });

  it('explains a route that names a provider that is not configured', async () => {
    setLLMAppStateReader(async () => ({
      privateMode: false,
      routing: { features: { labelSuggestion: 'ghost' } },
    }));
    stubFetch();

    const error = await suggestLabel({ note: 'evening walk', llmSettings: llmSettings('openai') })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Routing sends labelSuggestion to "ghost"');
  });

  it('keeps private mode working with routing: a routed cloud provider is still refused', async () => {
    setLLMAppStateReader(async () => ({
      privateMode: true,
      routing: { features: { labelSuggestion: 'openai' } },
    }));
    const fetchMock = stubFetch();

    await expect(suggestLabel({ note: 'evening walk', llmSettings: llmSettings('openai') })).rejects.toThrow(
      /Private mode is on/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
