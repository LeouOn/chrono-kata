import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { DexieLLMSettingsRepository, resolveEnvSeeds } from '@/lib/db/llm-settings.repo';

describe('LLMSettingsRepository Environment Variable Seeding', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await resetDbForTesting();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves env seeds for OpenAI, OpenRouter, and Claude', () => {
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-openai-test';
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY = 'sk-or-test';
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY = 'sk-ant-test';

    const seeds = resolveEnvSeeds();

    expect(seeds.openai).toBeDefined();
    expect(seeds.openai?.apiKey).toBe('sk-openai-test');
    expect(seeds.openrouter).toBeDefined();
    expect(seeds.openrouter?.apiKey).toBe('sk-or-test');
    expect(seeds.claude).toBeDefined();
    expect(seeds.claude?.apiKey).toBe('sk-ant-test');
  });

  it('resolves custom base URLs and models from environment', () => {
    process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY = 'sk-deepseek-test';
    process.env.NEXT_PUBLIC_DEEPSEEK_MODEL = 'deepseek-chat';
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = 'sk-gemini-test';

    const seeds = resolveEnvSeeds();

    expect(seeds.deepseek?.apiKey).toBe('sk-deepseek-test');
    expect(seeds.deepseek?.model).toBe('deepseek-chat');
    expect(seeds.gemini?.apiKey).toBe('sk-gemini-test');
  });

  it('initializes Dexie LLMSettings with default provider from NEXT_PUBLIC_DEFAULT_PROVIDER', async () => {
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY = 'sk-or-123';
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-oa-456';
    process.env.NEXT_PUBLIC_DEFAULT_PROVIDER = 'openai';

    const repo = new DexieLLMSettingsRepository();
    const settings = await repo.get();

    expect(settings.activeProviderName).toBe('openai');
    expect(settings.providers.openai?.apiKey).toBe('sk-oa-456');
    expect(settings.providers.openrouter?.apiKey).toBe('sk-or-123');
  });
});
