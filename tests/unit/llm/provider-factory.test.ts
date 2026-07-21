import { describe, it, expect } from 'vitest';
import { createLLMProvider } from '@/lib/llm/provider-factory';
import { OpenAICompatibleProvider } from '@/lib/llm/openai-compatible-provider';
import { ClaudeProvider } from '@/lib/llm/claude-provider';
import { GeminiProvider } from '@/lib/llm/gemini-provider';
import { PROVIDER_DEFAULTS } from '@/lib/llm/provider-defaults';

describe('createLLMProvider', () => {
  const cfg = (name: keyof typeof PROVIDER_DEFAULTS, apiKey = 'test') => ({
    providerName: name,
    baseUrl: PROVIDER_DEFAULTS[name].baseUrl,
    model: PROVIDER_DEFAULTS[name].model,
    apiKey,
  });

  it('returns ClaudeProvider for claude', () => {
    expect(createLLMProvider(cfg('claude'))).toBeInstanceOf(ClaudeProvider);
  });

  it('returns GeminiProvider for gemini', () => {
    expect(createLLMProvider(cfg('gemini'))).toBeInstanceOf(GeminiProvider);
  });

  it('returns OpenAICompatibleProvider for openai', () => {
    expect(createLLMProvider(cfg('openai'))).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('returns OpenAICompatibleProvider for all other OpenAI-compatible providers', () => {
    const openaiCompatible = ['deepseek', 'deepseek-pro', 'openrouter', 'zai', 'minimax', 'nemotron', 'ollama'] as const;
    for (const name of openaiCompatible) {
      expect(createLLMProvider(cfg(name))).toBeInstanceOf(OpenAICompatibleProvider);
    }
  });

  it('falls back to OpenAICompatibleProvider for unknown names', () => {
    expect(
      createLLMProvider({ providerName: 'unknown', baseUrl: 'https://x', model: 'm', apiKey: 'k' })
    ).toBeInstanceOf(OpenAICompatibleProvider);
  });
});
