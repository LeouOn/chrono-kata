import type { Settings } from '@/lib/schemas/settings';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { getDb } from './db';

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  patch(patch: Partial<Settings>): Promise<Settings>;
}

export class DexieSettingsRepository implements SettingsRepository {
  async get(): Promise<Settings> {
    const db = getDb();
    const existing = await db.settings.get('singleton');
    if (existing) return existing;
    const now = new Date();
    const fresh: Settings = { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now };
    await db.settings.put(fresh);
    return fresh;
  }

  async save(settings: Settings): Promise<void> {
    await getDb().settings.put(settings);
  }

  async patch(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.get();
    const updated: Settings = { ...current, ...patch, updatedAt: new Date() };
    await getDb().settings.put(updated);
    return updated;
  }
}

export const settingsRepo: SettingsRepository = new DexieSettingsRepository();
