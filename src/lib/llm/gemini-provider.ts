import type { ChatResponse, LLMProvider, StreamChunk } from './types';
import { LLMException, StopReason } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';
import { parseSSELines, extractContentFromGeminiChunk } from './sse-parser';

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Adapter for Google's Gemini API.
 *
 * Wire format: POST {baseUrl}/models/{model}:generateContent?key={apiKey}
 * Auth: API key as query parameter (NOT a header).
 * System prompt goes in top-level systemInstruction object.
 */
export class GeminiProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async completeSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    const url =
      `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}` +
      `:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: input.userText }] }],
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (e) {
      throw mapFetchError(e);
    }

    const statusError = mapResponseStatus(resp.status, resp.statusText);
    if (statusError) throw statusError;

    let json: GeminiResponse;
    try {
      json = (await resp.json()) as GeminiResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse Gemini response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    let text: string | null = null;
    let thinking: string | null = null;
    for (const p of parts) {
      if (typeof p.text !== 'string') continue;
      if (p.thought === true) {
        thinking = p.text;
      } else if (text === null) {
        text = p.text;
      }
    }

    if (!text) {
      if (thinking) {
        text = thinking;
        thinking = null;
      } else {
        throw new LLMException('Gemini response had no text.');
      }
    }

    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: StopReason.EndTurn,
      thinking,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async streamCompleteSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
    onChunk: (chunk: StreamChunk) => void;
  }): Promise<{ promptTokens: number; completionTokens: number }> {
    const url =
      `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}` +
      `:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: input.userText }] }],
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (e) {
      throw mapFetchError(e);
    }

    const statusError = mapResponseStatus(resp.status, resp.statusText);
    if (statusError) throw statusError;

    if (!resp.body) throw new LLMException('No response body for streaming.');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = parseSSELines(buffer);
      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline >= 0) {
        buffer = buffer.slice(lastDoubleNewline + 2);
      }

      for (const data of lines) {
        const content = extractContentFromGeminiChunk(data);
        if (content) {
          input.onChunk({ content });
        }
        try {
          const parsed = JSON.parse(data) as {
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };
          if (parsed.usageMetadata) {
            promptTokens = parsed.usageMetadata.promptTokenCount ?? promptTokens;
            completionTokens = parsed.usageMetadata.candidatesTokenCount ?? completionTokens;
          }
        } catch {
          // Fine.
        }
      }
    }

    input.onChunk({ content: null });
    return { promptTokens, completionTokens };
  }
}
