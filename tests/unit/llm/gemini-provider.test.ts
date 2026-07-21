import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '@/lib/llm/gemini-provider';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('GeminiProvider', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with API key as query param + correct body shape', async () => {
    let capturedUrl: string = '';
    let capturedBody: any = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: 'Gemini reply' }] } },
          ],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
        }),
        { status: 200 }
      );
    });

    const provider = new GeminiProvider({
      providerName: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gem-key',
      model: 'gemini-2.0-flash',
    });

    const result = await provider.completeSingle({
      userText: 'Hello',
      systemPrompt: 'Be brief.',
    });

    expect(capturedUrl).toContain('https://generativelanguage.googleapis.com/v1beta');
    expect(capturedUrl).toContain(':generateContent');
    expect(capturedUrl).toContain('key=gem-key');
    expect(capturedBody.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ]);
    expect(capturedBody.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(capturedBody.generationConfig.temperature).toBe(0.7);
    expect(result.content).toBe('Gemini reply');
    expect(result.usage?.promptTokens).toBe(8);
    expect(result.usage?.completionTokens).toBe(4);
  });

  it('parses "thought" parts separately', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: 'internal' },
                  { text: 'final' },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
        }),
        { status: 200 }
      )
    );
    const provider = new GeminiProvider({
      providerName: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'x',
      model: 'gemini-2.0-flash',
    });
    const result = await provider.completeSingle({
      userText: 'q',
      systemPrompt: 's',
    });
    expect(result.content).toBe('final');
    expect(result.thinking).toBe('internal');
  });
});
