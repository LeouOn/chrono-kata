import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkLocalHost, fetchLocalModels } from '@/lib/llm/local-models';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as unknown as Response;
}

describe('fetchLocalModels', () => {
  it('lists the models a local server offers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: 'qwen2.5-7b' }, { id: 'llama-3.2-3b' }, { id: 'qwen2.5-7b' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLocalModels('http://localhost:1234/v1');

    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['llama-3.2-3b', 'qwen2.5-7b']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('reports a host that answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' })));

    const result = await fetchLocalModels('http://localhost:1234/v1');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
    expect(result.error).toContain('local server');
  });

  it('reports an unreachable host with what to check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await fetchLocalModels('http://192.168.1.5:1234/v1');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('192.168.1.5:1234');
    expect(result.error).toContain('Start Server');
    expect(result.error).toContain('network');
  });

  it('reports a host that never answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));

    const result = await fetchLocalModels('http://localhost:1234/v1', { timeoutMs: 1000 });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not answer within 1s');
  });

  it('rejects a URL that cannot be parsed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLocalModels('localhost:1234');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not a valid URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an empty host', async () => {
    const result = await fetchLocalModels('  ');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No host configured');
  });

  it('reports a host that serves no models without calling it a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const result = await fetchLocalModels('http://localhost:1234/v1');

    expect(result.ok).toBe(true);
    expect(result.models).toEqual([]);
  });

  it('explains a mixed-content block when the page is https', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { protocol: 'https:' });

    const result = await fetchLocalModels('http://localhost:1234/v1');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('mixed content');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a non-local host in private mode, without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLocalModels('https://api.openai.com/v1', { privateMode: true });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Private mode is on');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow redirects in private mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'a' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLocalModels('http://localhost:1234/v1', { privateMode: true });

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('leaves redirect behaviour alone outside private mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchLocalModels('http://localhost:1234/v1');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.redirect).toBeUndefined();
  });
});

describe('checkLocalHost', () => {
  it('reports a healthy host and how many models it serves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'a' }] })));

    const result = await checkLocalHost('http://localhost:1234/v1');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 model');
  });

  it('reports a reachable host with no models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const result = await checkLocalHost('http://localhost:1234/v1');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('no models');
  });

  it('passes the failure message through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await checkLocalHost('http://localhost:1234/v1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Could not reach');
  });
});
