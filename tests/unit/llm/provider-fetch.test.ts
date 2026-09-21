import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerFetch } from '@/lib/llm/provider-fetch';
import { createLLMProvider } from '@/lib/llm/provider-factory';
import { resolveEnvironmentProviders } from '@/lib/llm/server/environment';

const config = { providerName: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: 'chosen', credentialSource: 'environment' as const };
afterEach(() => vi.unstubAllGlobals());
describe('provider transport', () => {
  it('keeps pasted-key requests direct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const options = { method: 'POST', headers: { Authorization: 'Bearer pasted' }, body: '{}' };
    await providerFetch({ ...config, credentialSource: 'browser', apiKey: 'pasted' }, 'https://provider.test', options);
    expect(fetchMock).toHaveBeenCalledWith('https://provider.test', options);
  });
  it('routes an environment completion through localhost without sending auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createLLMProvider(config).completeSingle({ userText: 'test', systemPrompt: 'OK' });
    expect(result.content).toBe('OK');
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/local-ai');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toMatchObject({ providerName: 'openrouter', model: 'chosen', stream: false });
  });
  it('streams through the proxy using the existing parser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(config) as import('@/lib/llm/types').StreamingLLMProvider;
    const onChunk = vi.fn();
    await provider.streamCompleteSingle({ userText: 'test', systemPrompt: 'OK', onChunk });
    expect(onChunk).toHaveBeenCalledWith({ content: 'OK' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).stream).toBe(true);
  });
  it('supports all configured server aliases and keeps model overrides', () => {
    const configs = resolveEnvironmentProviders({ ANTHROPIC_API_KEY: 'a', GOOGLE_API_KEY: 'g', OLLAMA_ENABLED: 'true', OLLAMA_MODEL: 'local-model' });
    expect(Object.keys(configs).sort()).toEqual(['claude', 'gemini', 'ollama']);
    expect(configs.ollama?.model).toBe('local-model');
  });
});

it('uses bounded non-thinking requests for the DeepSeek default', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));
  vi.stubGlobal('fetch', fetchMock);
  await createLLMProvider({ ...config, providerName: 'deepseek', model: 'deepseek-flash' }).completeSingle({ userText: 'test', systemPrompt: 'OK' });
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body).body).toMatchObject({ thinking: { type: 'disabled' }, max_tokens: 800 });
});
