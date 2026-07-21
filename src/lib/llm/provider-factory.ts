import type { LLMProvider } from './types';
import type { ProviderConfig } from './provider-config';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { ClaudeProvider } from './claude-provider';
import { GeminiProvider } from './gemini-provider';

/**
 * Construct the concrete LLMProvider for a given config.
 * Unknown provider names fall back to OpenAICompatibleProvider (the de-facto
 * standard for self-hosted and third-party gateways).
 */
export function createLLMProvider(config: ProviderConfig): LLMProvider {
  switch (config.providerName) {
    case 'claude':
      return new ClaudeProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
    case 'deepseek':
    case 'deepseek-pro':
    case 'openrouter':
    case 'zai':
    case 'minimax':
    case 'nemotron':
    case 'ollama':
    default:
      return new OpenAICompatibleProvider(config);
  }
}
