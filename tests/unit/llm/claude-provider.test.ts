import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '@/lib/llm/claude-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('ClaudeProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to {baseUrl}/messages with x-api-key header + correct body', async () => {
    let capturedBody: any = null;
    let capturedInit: any = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Hello from Claude' }],
          usage: { input_tokens: 12, output_tokens: 6 },
        }),
        { status: 200 }
      );
    });

    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'Be brief.',
    });

    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers['x-api-key']).toBe('sk-ant-test');
    expect(capturedInit.headers['anthropic-version']).toBe('2023-06-01');
    expect(capturedBody.model).toBe('claude-sonnet-4-20250514');
    expect(capturedBody.system).toBe('Be brief.');
    expect(capturedBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Claude');
    expect(result.usage?.promptTokens).toBe(12);
    expect(result.usage?.completionTokens).toBe(6);
  });

  it('parses thinking blocks separately', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: 'thinking', thinking: 'internal reasoning' },
            { type: 'text', text: 'final answer' },
          ],
          usage: { input_tokens: 5, output_tokens: 10 },
        }),
        { status: 200 }
      )
    );
    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'x',
      model: 'claude-sonnet-4-20250514',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('final answer');
    expect(result.thinking).toBe('internal reasoning');
  });

  it('throws authFailed on 401', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 401 }));
    const provider = new ClaudeProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'bad',
      model: 'claude-sonnet-4-20250514',
    });
    await expect(
      provider.completeSingle({ userText: 'q', systemPrompt: 's' })
    ).rejects.toMatchObject({ kind: LLMExceptionKind.AuthFailed });
  });
});
