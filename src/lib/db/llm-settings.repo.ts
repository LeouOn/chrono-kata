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
    if (existing) return existing;
    const now = new Date();
    const fresh: LLMSettings = {
      id: 'singleton',
      activeProviderName: 'claude',
      providers: {},
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
    const updated: LLMSettings = {
      ...current,
      providers: { ...current.providers, [name]: config },
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
