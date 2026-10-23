import { describe, it, expect, vi, afterEach } from 'vitest';
import { suggestLabel } from '@/lib/llm/llm-service';
import { resetLLMAppStateReader, setLLMAppStateReader } from '@/lib/llm/app-state';
import type { LLMSettings } from '@/lib/schemas/llm-settings';

afterEach(() => {
  resetLLMAppStateReader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const localEntry = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'local-model',
  apiKey: '',
  credentialSource: 'browser' as const,
};

function llmSettings(): LLMSettings {
  return {
    id: 'singleton',
    activeProviderName: 'lmstudio',
    providers: { lmstudio: localEntry },
    totalTokensThisMonth: 0,
    totalTokensResetAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  };
}

/**
 * A mock server that answers a 307 to a public address.
 *
 * With `redirect: 'error'` the browser rejects the request instead of
 * following it, so the body never reaches the public host and fetch is not
 * called a second time.
 */
function stubRedirectingServer() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.redirect === 'error') {
      // What the browser does for a 3xx when redirects are refused.
      throw new TypeError('Failed to fetch');
    }
    return {
      ok: false,
      status: 307,
      statusText: 'Temporary Redirect',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: new Headers({ location: 'https://api.openai.com/v1/chat/completions' }),
      json: async () => ({}),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('private mode and redirects', () => {
  it('does not follow a redirect from a local host and never sends the body twice', async () => {
    setLLMAppStateReader(async () => ({ privateMode: true }));
    const fetchMock = stubRedirectingServer();

    const error = await suggestLabel({ note: 'evening walk', llmSettings: llmSettings() })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('could not be reached, or it tried to redirect');
    expect((error as Error).message).toContain('does not follow redirects');
    // One request only: the body was not carried to the redirect target.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(options?.redirect).toBe('error');
    expect(options?.body).toContain('evening walk');
  });

  it('leaves redirect behaviour alone outside private mode', async () => {
    setLLMAppStateReader(async () => ({ privateMode: false }));
    const fetchMock = stubRedirectingServer();

    await suggestLabel({ note: 'evening walk', llmSettings: llmSettings() }).catch(() => null);

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(options?.redirect).toBeUndefined();
  });
});
