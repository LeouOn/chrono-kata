import type { LLMSettings } from '@/lib/schemas/llm-settings';
import { PROVIDER_DEFAULTS } from '@/lib/llm/provider-defaults';
import { getDb } from './db';

export interface LLMSettingsRepository {
  get(): Promise<LLMSettings>;
  save(settings: LLMSettings): Promise<void>;
  addProvider(name: string, config: { baseUrl: string; apiKey: string; model: string }): Promise<LLMSettings>;
  removeProvider(name: string): Promise<LLMSettings>;
  setActive(name: string): Promise<LLMSettings>;
  incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void>;
}

export function resolveEnvSeeds(): Record<string, { baseUrl: string; apiKey: string; model: string }> {
  const envSeeds: Record<string, { baseUrl: string; apiKey: string; model: string }> = {};

  // OpenRouter
  const openrouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_SEED_OPENROUTER_KEY;
  if (openrouterKey) {
    envSeeds['openrouter'] = {
      baseUrl: process.env.NEXT_PUBLIC_OPENROUTER_BASE_URL || PROVIDER_DEFAULTS.openrouter.baseUrl,
      apiKey: openrouterKey,
      model: process.env.NEXT_PUBLIC_OPENROUTER_MODEL || PROVIDER_DEFAULTS.openrouter.model,
    };
  }

  // OpenAI
  const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.NEXT_PUBLIC_SEED_OPENAI_KEY;
  if (openaiKey) {
    envSeeds['openai'] = {
      baseUrl: process.env.NEXT_PUBLIC_OPENAI_BASE_URL || PROVIDER_DEFAULTS.openai.baseUrl,
      apiKey: openaiKey,
      model: process.env.NEXT_PUBLIC_OPENAI_MODEL || PROVIDER_DEFAULTS.openai.model,
    };
  }

  // Claude / Anthropic
  const claudeKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_CLAUDE_API_KEY;
  if (claudeKey) {
    envSeeds['claude'] = {
      baseUrl: process.env.NEXT_PUBLIC_CLAUDE_BASE_URL || PROVIDER_DEFAULTS.claude.baseUrl,
      apiKey: claudeKey,
      model: process.env.NEXT_PUBLIC_CLAUDE_MODEL || PROVIDER_DEFAULTS.claude.model,
    };
  }

  // Gemini / Google
  const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (geminiKey) {
    envSeeds['gemini'] = {
      baseUrl: process.env.NEXT_PUBLIC_GEMINI_BASE_URL || PROVIDER_DEFAULTS.gemini.baseUrl,
      apiKey: geminiKey,
      model: process.env.NEXT_PUBLIC_GEMINI_MODEL || PROVIDER_DEFAULTS.gemini.model,
    };
  }

  // DeepSeek
  const deepseekKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
  if (deepseekKey) {
    envSeeds['deepseek'] = {
      baseUrl: process.env.NEXT_PUBLIC_DEEPSEEK_BASE_URL || PROVIDER_DEFAULTS.deepseek.baseUrl,
      apiKey: deepseekKey,
      model: process.env.NEXT_PUBLIC_DEEPSEEK_MODEL || PROVIDER_DEFAULTS.deepseek.model,
    };
  }

  // Zhipu AI / GLM
  const zaiKey = process.env.NEXT_PUBLIC_ZAI_API_KEY || process.env.NEXT_PUBLIC_SEED_ZAI_KEY;
  if (zaiKey) {
    envSeeds['zai'] = {
      baseUrl: process.env.NEXT_PUBLIC_ZAI_BASE_URL || PROVIDER_DEFAULTS.zai.baseUrl,
      apiKey: zaiKey,
      model: process.env.NEXT_PUBLIC_ZAI_MODEL || PROVIDER_DEFAULTS.zai.model,
    };
  }

  // MiniMax
  const minimaxKey = process.env.NEXT_PUBLIC_MINIMAX_API_KEY;
  if (minimaxKey) {
    envSeeds['minimax'] = {
      baseUrl: process.env.NEXT_PUBLIC_MINIMAX_BASE_URL || PROVIDER_DEFAULTS.minimax.baseUrl,
      apiKey: minimaxKey,
      model: process.env.NEXT_PUBLIC_MINIMAX_MODEL || PROVIDER_DEFAULTS.minimax.model,
    };
  }

  // Nvidia Nemotron
  const nemotronKey = process.env.NEXT_PUBLIC_NEMOTRON_API_KEY;
  if (nemotronKey) {
    envSeeds['nemotron'] = {
      baseUrl: process.env.NEXT_PUBLIC_NEMOTRON_BASE_URL || PROVIDER_DEFAULTS.nemotron.baseUrl,
      apiKey: nemotronKey,
      model: process.env.NEXT_PUBLIC_NEMOTRON_MODEL || PROVIDER_DEFAULTS.nemotron.model,
    };
  }

  // Ollama (Local)
  if (process.env.NEXT_PUBLIC_OLLAMA_ENABLED === 'true' || process.env.NEXT_PUBLIC_OLLAMA_BASE_URL) {
    envSeeds['ollama'] = {
      baseUrl: process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || PROVIDER_DEFAULTS.ollama.baseUrl,
      apiKey: 'ollama',
      model: process.env.NEXT_PUBLIC_OLLAMA_MODEL || PROVIDER_DEFAULTS.ollama.model,
    };
  }

  return envSeeds;
}

export class DexieLLMSettingsRepository implements LLMSettingsRepository {
  async get(): Promise<LLMSettings> {
    const db = getDb();
    const existing = await db.llmSettings.get('singleton');
    const envSeeds = resolveEnvSeeds();
    const defaultProvider = process.env.NEXT_PUBLIC_DEFAULT_PROVIDER;

    if (existing) {
      // Auto-merge any env seeds that aren't already configured.
      const envSeedNames = Object.keys(envSeeds);
      const missingSeeds = envSeedNames.filter((n) => !existing.providers[n]);
      if (missingSeeds.length > 0) {
        const providers = { ...existing.providers };
        for (const name of missingSeeds) {
          providers[name] = envSeeds[name]!;
        }
        let activeProviderName = existing.activeProviderName;
        if (defaultProvider && defaultProvider in providers) {
          activeProviderName = defaultProvider;
        } else if (!activeProviderName || !(activeProviderName in providers)) {
          activeProviderName = missingSeeds[0] ?? existing.activeProviderName;
        }

        const updated: LLMSettings = {
          ...existing,
          providers,
          activeProviderName,
          updatedAt: new Date(),
        };
        await db.llmSettings.put(updated);
        return updated;
      }
      return existing;
    }

    const initialActive =
      defaultProvider && defaultProvider in envSeeds
        ? defaultProvider
        : (Object.keys(envSeeds)[0] ?? '');

    const now = new Date();
    const fresh: LLMSettings = {
      id: 'singleton',
      activeProviderName: initialActive,
      providers: envSeeds,
      totalTokensThisMonth: 0,
      totalTokensResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      updatedAt: now,
    };
    await db.llmSettings.put(fresh);
    return fresh;
  }

  async save(settings: LLMSettings): Promise<void> {
    await getDb().llmSettings.put(settings);
  }

  async addProvider(name: string, config: { baseUrl: string; apiKey: string; model: string }): Promise<LLMSettings> {
    const current = await this.get();
    const providers = { ...current.providers, [name]: config };
    const currentActiveExists = current.activeProviderName in providers;
    const activeProviderName = currentActiveExists ? current.activeProviderName : name;
    const updated: LLMSettings = {
      ...current,
      providers,
      activeProviderName,
      updatedAt: new Date(),
    };
    await getDb().llmSettings.put(updated);
    return updated;
  }

  async removeProvider(name: string): Promise<LLMSettings> {
    const current = await this.get();
    const providers = { ...current.providers };
    delete providers[name];
    let activeProviderName = current.activeProviderName;
    if (activeProviderName === name) {
      const remaining = Object.keys(providers);
      activeProviderName = remaining[0] ?? '';
    }
    const updated: LLMSettings = {
      ...current,
      providers,
      activeProviderName,
      updatedAt: new Date(),
    };
    await getDb().llmSettings.put(updated);
    return updated;
  }

  async setActive(name: string): Promise<LLMSettings> {
    const current = await this.get();
    const updated: LLMSettings = {
      ...current,
      activeProviderName: name,
      updatedAt: new Date(),
    };
    await getDb().llmSettings.put(updated);
    return updated;
  }

  async incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void> {
    const current = await this.get();
    const now = new Date();
    // Reset monthly counter if we crossed into a new month.
    const resetAt = current.totalTokensResetAt;
    const shouldReset = now >= resetAt;
    const updated: LLMSettings = {
      ...current,
      totalTokensThisMonth: (shouldReset ? 0 : current.totalTokensThisMonth) + promptTokens + completionTokens,
      totalTokensResetAt: shouldReset
        ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
        : resetAt,
      updatedAt: now,
    };
    await getDb().llmSettings.put(updated);
  }
}

export const llmSettingsRepo: LLMSettingsRepository = new DexieLLMSettingsRepository();
