import type { Settings } from '@/lib/schemas/settings';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import type { FlagName, LLMRouting } from '@/lib/schemas/settings';
import { withFlag } from '@/lib/settings/flags';
import { getDb } from './db';

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  patch(patch: Partial<Settings>): Promise<Settings>;
  /**
   * Merge against the row as it is INSIDE one transaction.
   *
   * Use this instead of `patch({ nested: { ...renderedState } })` when the new
   * value depends on the current one: a value read during render can be stale by
   * the time the write lands, and the patch would then revert a field somebody
   * else just saved.
   */
  patchWith(merge: (current: Settings) => Partial<Settings>): Promise<Settings>;
  /** Set one feature flag, leaving every other flag and setting untouched. */
  setFlag(flag: FlagName, value: boolean): Promise<Settings>;
  /** Replace the per-feature provider routing table. */
  setLLMRouting(routing: LLMRouting | undefined): Promise<Settings>;
}

export class DexieSettingsRepository implements SettingsRepository {
  /**
   * The stored row, creating the defaults on first read.
   *
   * The common path is a plain read, so it can run inside a caller's READ-ONLY
   * transaction (the importer's merge/preview does exactly that) and never takes
   * a write lock just to read a row that exists.
   *
   * Only when the row is missing does it open a read-write transaction, and it
   * re-checks inside it: a plain read-then-write could put the defaults back over
   * a setting another caller wrote in the same first-paint window (several
   * queries ask at once, and a toggle pressed in that window was lost).
   */
  async get(): Promise<Settings> {
    const db = getDb();
    const existing = await db.settings.get('singleton');
    if (existing) return existing;
    return db.transaction('rw', db.settings, async () => {
      const again = await db.settings.get('singleton');
      if (again) return again;
      const now = new Date();
      const fresh: Settings = { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now };
      await db.settings.put(fresh);
      return fresh;
    });
  }

  async save(settings: Settings): Promise<void> {
    await getDb().settings.put(settings);
  }

  /**
   * Merge a patch into the stored row.
   *
   * The read and the write are ONE transaction: two patches that overlap (the
   * two waking-hours inputs save on every change, for example) must not both
   * read the old row and let the later write drop the earlier field. Dexie
   * serialises transactions on the same table, so every caller — `setFlag`,
   * `setLLMRouting`, the planning and settings screens — inherits the fix.
   */
  async patch(patch: Partial<Settings>): Promise<Settings> {
    return this.patchWith(() => patch);
  }

  /**
   * Merge against the row as it is INSIDE the transaction.
   *
   * A caller that has to look at the current value before deciding what to
   * write (a flag toggle merges into the other flags) must do that read here,
   * not with a separate `get()` first: a value read outside the transaction can
   * be stale by the time the write lands.
   */
  async patchWith(merge: (current: Settings) => Partial<Settings>): Promise<Settings> {
    const db = getDb();
    return db.transaction('rw', db.settings, async () => {
      const current = await this.get();
      const updated: Settings = { ...current, ...merge(current), updatedAt: new Date() };
      await db.settings.put(updated);
      return updated;
    });
  }

  async setFlag(flag: FlagName, value: boolean): Promise<Settings> {
    return this.patchWith((current) => ({ flags: withFlag(current.flags, flag, value) }));
  }

  async setLLMRouting(routing: LLMRouting | undefined): Promise<Settings> {
    return this.patchWith(() => ({ llmRouting: routing }));
  }
}

export const settingsRepo: SettingsRepository = new DexieSettingsRepository();
