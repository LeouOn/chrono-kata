import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '@/lib/llm/openai-compatible-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('OpenAICompatibleProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends POST to {baseUrl}/chat/completions with Bearer auth + correct body', async () => {
    let capturedBody: any = null;
    let capturedInit: any = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello back' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 }
      );
    });

    const provider = new OpenAICompatibleProvider({
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'You are a test bot.',
    });

    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers['Authorization']).toBe('Bearer sk-test');
    expect(capturedInit.headers['Content-Type']).toBe('application/json');
    expect(capturedBody.model).toBe('gpt-4o');
    expect(capturedBody.messages).toEqual([
      { role: 'system', content: 'You are a test bot.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(capturedBody.temperature).toBe(0.7);
    expect(result.content).toBe('Hello back');
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
  });

  it('throws authFailed on 401', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })
    );
    const provider = new OpenAICompatibleProvider({
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'bad',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'hi', systemPrompt: 'sys' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.AuthFailed });
  });

  it('throws rateLimited on 429 after retries exhausted', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 429 }));
    const provider = new OpenAICompatibleProvider({
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'x',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'hi', systemPrompt: 'sys' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.RateLimited });
  });

  it('retries on transient 429 and succeeds when second attempt returns 200', async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Recovered after rate limit' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5 },
        }),
        { status: 200 }
      );
    });

    const provider = new OpenAICompatibleProvider({
      providerName: 'zai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'test-key',
      model: 'glm-4-flash',
    });

    const result = await provider.completeSingle({ userText: 'hi', systemPrompt: 'sys' });
    expect(callCount).toBe(2);
    expect(result.content).toBe('Recovered after rate limit');
  });

  it('handles reasoning_content (DeepSeek / GLM)', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'visible answer', reasoning_content: '<thinking>' } },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 8 },
        }),
        { status: 200 }
      )
    );
    const provider = new OpenAICompatibleProvider({
      providerName: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'x',
      model: 'deepseek-v4-flash',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('visible answer');
    expect(result.thinking).toBe('<thinking>');
  });

  it('throws when response has no content', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }),
        { status: 200 }
      )
    );
    const provider = new OpenAICompatibleProvider({
      providerName: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'x',
      model: 'gpt-4o',
    });
    await expect(
      provider.completeSingle({ userText: 'q', systemPrompt: 's' })
    ).rejects.toThrow(/no text/i);
  });
});
