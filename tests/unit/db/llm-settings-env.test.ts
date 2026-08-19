import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { DexieLLMSettingsRepository, resolveEnvSeeds } from '@/lib/db/llm-settings.repo';

function clearLLMEnv() {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  delete process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  delete process.env.NEXT_PUBLIC_OPENAI_BASE_URL;
  delete process.env.NEXT_PUBLIC_OPENAI_MODEL;
  delete process.env.NEXT_PUBLIC_SEED_OPENAI_KEY;

  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.CLAUDE_BASE_URL;
  delete process.env.CLAUDE_MODEL;
  delete process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  delete process.env.NEXT_PUBLIC_CLAUDE_API_KEY;
  delete process.env.NEXT_PUBLIC_CLAUDE_BASE_URL;
  delete process.env.NEXT_PUBLIC_CLAUDE_MODEL;

  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  delete process.env.NEXT_PUBLIC_OPENROUTER_BASE_URL;
  delete process.env.NEXT_PUBLIC_OPENROUTER_MODEL;
  delete process.env.NEXT_PUBLIC_SEED_OPENROUTER_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_BASE_URL;
  delete process.env.GEMINI_MODEL;
  delete process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  delete process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  delete process.env.NEXT_PUBLIC_GEMINI_BASE_URL;
  delete process.env.NEXT_PUBLIC_GEMINI_MODEL;

  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
  delete process.env.NEXT_PUBLIC_DEEPSEEK_BASE_URL;
  delete process.env.NEXT_PUBLIC_DEEPSEEK_MODEL;

  delete process.env.DEFAULT_PROVIDER;
  delete process.env.NEXT_PUBLIC_DEFAULT_PROVIDER;
}

describe('LLMSettingsRepository Environment Variable Seeding', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await resetDbForTesting();
    process.env = { ...originalEnv };
    clearLLMEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves standard desktop env variables without NEXT_PUBLIC_ prefix', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-standard';
    process.env.ANTHROPIC_API_KEY = 'sk-claude-standard';
    process.env.OPENROUTER_API_KEY = 'sk-openrouter-standard';
    process.env.GEMINI_API_KEY = 'sk-gemini-standard';

    const seeds = resolveEnvSeeds();

    expect(seeds.openai?.apiKey).toBe('sk-openai-standard');
    expect(seeds.claude?.apiKey).toBe('sk-claude-standard');
    expect(seeds.openrouter?.apiKey).toBe('sk-openrouter-standard');
    expect(seeds.gemini?.apiKey).toBe('sk-gemini-standard');
  });

  it('resolves env seeds for OpenAI, OpenRouter, and Claude with NEXT_PUBLIC_ prefix', () => {
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
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test';
    process.env.DEEPSEEK_MODEL = 'deepseek-chat';
    process.env.GEMINI_API_KEY = 'sk-gemini-test';

    const seeds = resolveEnvSeeds();

    expect(seeds.deepseek?.apiKey).toBe('sk-deepseek-test');
    expect(seeds.deepseek?.model).toBe('deepseek-chat');
    expect(seeds.gemini?.apiKey).toBe('sk-gemini-test');
  });

  it('initializes Dexie LLMSettings with default provider from DEFAULT_PROVIDER', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-123';
    process.env.OPENAI_API_KEY = 'sk-oa-456';
    process.env.DEFAULT_PROVIDER = 'openai';

    const repo = new DexieLLMSettingsRepository();
    const settings = await repo.get();

    expect(settings.activeProviderName).toBe('openai');
    expect(settings.providers.openai?.apiKey).toBe('sk-oa-456');
    expect(settings.providers.openrouter?.apiKey).toBe('sk-or-123');
  });
});
