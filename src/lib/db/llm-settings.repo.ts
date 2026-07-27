import type { LLMSettings } from '@/lib/schemas/llm-settings';
import { getDb } from './db';

export interface LLMSettingsRepository {
  get(): Promise<LLMSettings>;
  save(settings: LLMSettings): Promise<void>;
  addProvider(name: string, config: { baseUrl: string; apiKey: string; model: string }): Promise<LLMSettings>;
  removeProvider(name: string): Promise<LLMSettings>;
  setActive(name: string): Promise<LLMSettings>;
  incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void>;
}

export class DexieLLMSettingsRepository implements LLMSettingsRepository {
  async get(): Promise<LLMSettings> {
    const db = getDb();
    const existing = await db.llmSettings.get('singleton');

    // Check for env-seeded providers (smoke test convenience).
    const seedZai = process.env.NEXT_PUBLIC_SEED_ZAI_KEY;
    const seedOpenRouter = process.env.NEXT_PUBLIC_SEED_OPENROUTER_KEY;
    const envSeeds: Record<string, { baseUrl: string; apiKey: string; model: string }> = {};
    if (seedZai) {
      envSeeds['zai'] = {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: seedZai,
        model: 'glm-5.2',
      };
    }
    if (seedOpenRouter) {
      envSeeds['openrouter'] = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: seedOpenRouter,
        model: 'minimax/MiniMax-M3',
      };
    }

    if (existing) {
      // Auto-merge any env seeds that aren't already configured.
      const envSeedNames = Object.keys(envSeeds);
      const missingSeeds = envSeedNames.filter((n) => !existing.providers[n]);
      if (missingSeeds.length > 0) {
        const providers = { ...existing.providers };
        for (const name of missingSeeds) {
          providers[name] = envSeeds[name]!;
        }
        const activeProviderName = existing.activeProviderName in providers
          ? existing.activeProviderName
          : (missingSeeds[0] ?? existing.activeProviderName);
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

    const now = new Date();
    const fresh: LLMSettings = {
      id: 'singleton',
      activeProviderName: Object.keys(envSeeds)[0] ?? '',
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
