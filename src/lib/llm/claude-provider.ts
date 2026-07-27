import type { ChatResponse, LLMProvider, StreamChunk } from './types';
import { LLMException, StopReason } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';
import { parseSSELines, extractContentFromClaudeEvent } from './sse-parser';

interface ClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

interface ClaudeResponse {
  content?: ClaudeContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Adapter for Anthropic's Claude API.
 *
 * Wire format: POST {baseUrl}/messages
 * Auth: x-api-key header + anthropic-version: 2023-06-01
 * Differences from OpenAI: system is top-level field, not a message role;
 * max_tokens is required (we set 800 — enough for coach comments).
 */
export class ClaudeProvider implements LLMProvider {
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
    const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
    const body = {
      model: this.model,
      max_tokens: 800,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userText }],
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (e) {
      throw mapFetchError(e);
    }

    const statusError = mapResponseStatus(resp.status, resp.statusText);
    if (statusError) throw statusError;

    let json: ClaudeResponse;
    try {
      json = (await resp.json()) as ClaudeResponse;
    } catch (e) {
      throw new LLMException(
        `Failed to parse Claude response: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    let text: string | null = null;
    let thinking: string | null = null;
    for (const block of json.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text = block.text;
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        thinking = block.thinking;
      }
    }

    if (!text) {
      if (thinking) {
        text = thinking;
        thinking = null;
      } else {
        throw new LLMException('Claude response had no text.');
      }
    }

    text = text.trim().replace(/^["']|["']$/g, '');

    return {
      content: text,
      stopReason: StopReason.EndTurn,
      thinking,
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }

  async streamCompleteSingle(input: {
    userText: string;
    systemPrompt: string;
    signal?: AbortSignal;
    onChunk: (chunk: StreamChunk) => void;
  }): Promise<{ promptTokens: number; completionTokens: number }> {
    return this.streamChat({
      messages: [{ role: 'user', content: input.userText }],
      systemPrompt: input.systemPrompt,
      signal: input.signal,
      onChunk: input.onChunk,
    });
  }

  async streamChat(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    systemPrompt: string;
    signal?: AbortSignal;
    onChunk: (chunk: StreamChunk) => void;
  }): Promise<{ promptTokens: number; completionTokens: number }> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
    const body = {
      model: this.model,
      max_tokens: 800,
      system: input.systemPrompt,
      messages: input.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
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
        const content = extractContentFromClaudeEvent(data);
        if (content === null) {
          input.onChunk({ content: null });
          continue;
        }
        if (content) {
          input.onChunk({ content });
        }
        try {
          const parsed = JSON.parse(data) as {
            type?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };
          if (parsed.type === 'message_start' && parsed.message?.usage) {
            promptTokens = parsed.message.usage.input_tokens ?? 0;
          }
          if (parsed.type === 'message_delta' && parsed.usage) {
            completionTokens = parsed.usage.output_tokens ?? 0;
          }
        } catch {
          // Fine.
        }
      }
    }

    return { promptTokens, completionTokens };
  }
}
