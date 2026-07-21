import type { ChatResponse, LLMProvider } from './types';
import { LLMException } from './types';
import { mapFetchError, mapResponseStatus } from './error-mapper';
import type { ProviderConfig } from './provider-config';

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
      stopReason: 'endTurn' as const,
      thinking: thinking && thinking.trim() ? thinking : null,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}
