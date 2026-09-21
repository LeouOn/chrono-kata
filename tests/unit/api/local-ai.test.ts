// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/local-ai/route';
import { isLocalAIRequest } from '@/lib/llm/server/environment';

const fetchMock = vi.fn();
function request(body?: unknown, origin = 'http://127.0.0.1:3000') {
  return new Request(`${origin}/api/local-ai`, {
    method: body ? 'POST' : 'GET',
    headers: { origin, 'x-chrono-local-ai': '1', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv('CHRONO_LOCAL_AI', 'true');
  vi.stubEnv('OPENROUTER_API_KEY', 'server-secret');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-secret');
  vi.stubEnv('ANTHROPIC_API_KEY', 'claude-secret');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('local AI route', () => {
  it('exposes only metadata and disables caching', async () => {
    const response = await GET(request());
    const text = await response.text();
    expect(text).not.toContain('server-secret');
    expect(JSON.parse(text).providers.openrouter.credentialSource).toBe('environment');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('requires opt-in, loopback host and same-origin browser requests', async () => {
    expect(isLocalAIRequest(request())).toBe(true);
    expect(isLocalAIRequest(new Request('http://localhost:3000/api/local-ai', {
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-chrono-local-ai': '1' },
    }))).toBe(true);
    expect(isLocalAIRequest(request(undefined, 'https://public.example'))).toBe(false);
    const cross = new Request('http://127.0.0.1:3000/api/local-ai', { headers: { origin: 'https://evil.example', 'x-chrono-local-ai': '1' } });
    expect(isLocalAIRequest(cross)).toBe(false);
    expect(isLocalAIRequest(new Request('http://localhost:3000/api/local-ai'))).toBe(false);
    vi.stubEnv('CHRONO_LOCAL_AI', 'false');
    expect((await POST(request({}))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses the server key and URL, ignoring client-supplied credentials and endpoints', async () => {
    fetchMock.mockResolvedValue(new Response('{"choices":[]}'));
    const response = await POST(request({ providerName: 'openrouter', model: 'chosen', stream: false, baseUrl: 'https://evil.example', apiKey: 'attacker', body: { messages: [], model: 'wrong' } }));
    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer server-secret');
    expect(JSON.parse(options.body).model).toBe('chosen');
    expect(options.redirect).toBe('error');
  });
  it('forwards SSE without buffering it into JSON', async () => {
    fetchMock.mockResolvedValue(new Response('data: {"delta":"ok"}\n\n'));
    const response = await POST(request({ providerName: 'openrouter', model: 'chosen', stream: true, body: { messages: [] } }));
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toContain('data:');
  });
  it('uses native Anthropic and Gemini routes and server headers', async () => {
    fetchMock.mockImplementation(async () => new Response('{}'));
    await POST(request({ providerName: 'claude', model: 'chosen', stream: false, body: { messages: [] } }));
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0]![1].headers['x-api-key']).toBe('claude-secret');
    await POST(request({ providerName: 'gemini', model: 'chosen', stream: true, body: { contents: [] } }));
    expect(fetchMock.mock.calls[1]![0]).toContain('/models/chosen:streamGenerateContent?alt=sse');
    expect(fetchMock.mock.calls[1]![0]).not.toContain('secret');
    expect(fetchMock.mock.calls[1]![1].headers['x-goog-api-key']).toBe('gemini-secret');
  });
  it('rejects unknown providers and invalid requests without fetching', async () => {
    expect((await POST(request({ providerName: 'unknown', model: 'm', stream: false, body: {} }))).status).toBe(404);
    expect((await POST(request({ providerName: 'openrouter' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not echo raw provider failures', async () => {
    fetchMock.mockResolvedValue(new Response('error echo server-secret', { status: 400 }));
    const response = await POST(request({ providerName: 'openrouter', model: 'chosen', stream: false, body: {} }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('server-secret');
  });
});
