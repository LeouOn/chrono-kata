import type { ChatResponse, LLMProvider, StreamChunk } from './types';
import { LLMException, StopReason } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';
import { parseSSELines, extractContentFromOpenAIChunk } from './sse-parser';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string; reasoning_content?: string };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Adapter for OpenAI-compatible providers: openai, deepseek, deepseek-pro,
 * openrouter, zai (GLM), minimax, nemotron (NVIDIA NIM), ollama.
 *
 * Wire format: POST {baseUrl}/chat/completions
 * Auth: Authorization: Bearer {apiKey}
 */
export class OpenAICompatibleProvider implements LLMProvider {
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
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userText },
      ] satisfies OpenAIMessage[],
      temperature: 0.7,
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (e) {
      throw mapFetchError(e);
    }

    const statusError = mapResponseStatus(resp.status, resp.statusText);
    if (statusError) throw statusError;

    let json: OpenAIResponse;
    try {
      json = (await resp.json()) as OpenAIResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse provider response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const message = json.choices?.[0]?.message;
    const content = message?.content;
    const thinking = message?.reasoning_content;

    let text: string;
    if (content && content.trim()) {
      text = content;
    } else if (thinking && thinking.trim()) {
      text = thinking;
    } else {
      throw new LLMException('Response had no text.');
    }

    // Strip wrapping quotes if present.
    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: StopReason.EndTurn,
      thinking: thinking && thinking.trim() ? thinking : null,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  async streamCompleteSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
    onChunk: (chunk: StreamChunk) => void;
  }): Promise<{ promptTokens: number; completionTokens: number }> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userText },
      ],
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
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
        const content = extractContentFromOpenAIChunk(data);
        if (content === null) {
          input.onChunk({ content: null });
          continue;
        }
        if (content) {
          input.onChunk({ content });
        }
        try {
          const parsed = JSON.parse(data) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
            completionTokens = parsed.usage.completion_tokens ?? completionTokens;
          }
        } catch {
          // Not JSON or no usage — fine.
        }
      }
    }

    return { promptTokens, completionTokens };
  }
}
