import type { LLMSettings } from '@/lib/schemas/llm-settings';
import { discoverLocalProviders } from '@/lib/llm/local-discovery';
import type { ProviderEntry } from '@/lib/schemas/llm-settings';
import { refreshLegacyPreset } from '@/lib/llm/provider-defaults';
import { getDb } from './db';

export interface LLMSettingsRepository {
  get(): Promise<LLMSettings>;
  save(settings: LLMSettings): Promise<void>;
  addProvider(name: string, config: ProviderEntry): Promise<LLMSettings>;
  removeProvider(name: string): Promise<LLMSettings>;
  setActive(name: string): Promise<LLMSettings>;
  incrementTokenUsage(promptTokens: number, completionTokens: number): Promise<void>;
}

export class DexieLLMSettingsRepository implements LLMSettingsRepository {
  async get(): Promise<LLMSettings> {
    const db = getDb();
    let existing = await db.llmSettings.get('singleton');
    if (existing) {
      const providers = Object.fromEntries(Object.entries(existing.providers).map(([name, entry]) => [name,
        entry.credentialSource ? entry : { ...entry, ...refreshLegacyPreset(name, entry), credentialSource: 'browser' as const },
      ]));
      if (JSON.stringify(providers) !== JSON.stringify(existing.providers)) {
        existing = { ...existing, providers, updatedAt: new Date() };
        await db.llmSettings.put(existing);
      }
    }
    const discovered = await discoverLocalProviders();
    const envSeeds = discovered.providers;
    const defaultProvider = discovered.defaultProvider;

    if (existing) {
      // Auto-merge any env seeds that aren't already configured.
      const envSeedNames = Object.keys(envSeeds);
      const missingSeeds = envSeedNames.filter((n) => !existing.providers[n] && !existing.dismissedEnvironmentProviders?.includes(n));
      if (missingSeeds.length > 0) {
        const providers = { ...existing.providers };
        for (const name of missingSeeds) {
          providers[name] = envSeeds[name]!;
        }
        let activeProviderName = existing.activeProviderName;
        if (!activeProviderName || !(activeProviderName in providers)) {
          activeProviderName = defaultProvider && defaultProvider in providers
            ? defaultProvider : missingSeeds[0] ?? existing.activeProviderName;
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

  async addProvider(name: string, config: ProviderEntry): Promise<LLMSettings> {
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
      dismissedEnvironmentProviders: [...new Set([...(current.dismissedEnvironmentProviders ?? []), name])],
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
