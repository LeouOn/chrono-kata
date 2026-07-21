import type { ChatResponse, LLMProvider } from './types';
import { LLMException } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';

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
      stopReason: 'endTurn' as const,
      thinking,
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }
}
