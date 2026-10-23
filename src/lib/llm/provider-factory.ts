import type { LLMProvider } from './types';
import type { ProviderConfig } from './provider-config';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import { ClaudeProvider } from './claude-provider';
import { GeminiProvider } from './gemini-provider';
import { assertProviderAllowed } from './privacy';

/**
 * Construct the concrete LLMProvider for a given config.
 * Unknown provider names fall back to OpenAICompatibleProvider (the de-facto
 * standard for self-hosted and third-party gateways).
 *
 * When `privateMode` is on, a non-local provider is refused here — before an
 * adapter exists, so before any request can be made — and the adapter is told
 * not to follow redirects.
 */
export function createLLMProvider(
  config: ProviderConfig,
  options: { privateMode?: boolean } = {},
): LLMProvider {
  const privateMode = options.privateMode ?? config.privateMode ?? false;
  assertProviderAllowed(config, privateMode);
  const effective: ProviderConfig = privateMode ? { ...config, privateMode: true } : config;
  switch (effective.providerName) {
    case 'claude':
      return new ClaudeProvider(effective);
    case 'gemini':
      return new GeminiProvider(effective);
    case 'openai':
    case 'deepseek':
    case 'deepseek-pro':
    case 'openrouter':
    case 'zai':
    case 'minimax':
    case 'nemotron':
    case 'ollama':
    default:
      return new OpenAICompatibleProvider(effective);
  }
}
