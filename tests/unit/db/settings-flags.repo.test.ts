import { describe, it, expect, beforeEach } from 'vitest';
import { DexieSettingsRepository } from '@/lib/db/settings.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { flagValue } from '@/lib/settings/flags';

beforeEach(async () => {
  await resetDbForTesting();
});

/** Seed a settings row from before flags existed, bypassing the repo's init logic. */
async function seedRowWithoutFlags() {
  const db = (await import('@/lib/db/db')).getDb();
  await db.settings.put({
    id: 'singleton',
    selectedCoachPersonality: 'zen',
    unlockedPersonalities: ['zen'],
    googleCalendarId: null,
    googleCalendarSyncEnabled: false,
    googleCalendarConnectedAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
  });
}

describe('settingsRepo feature flags', () => {
  it('reads a row that has no flags key', async () => {
    await seedRowWithoutFlags();

    const settings = await new DexieSettingsRepository().get();

    expect(settings.flags).toBeUndefined();
    expect(flagValue(settings.flags, 'sync')).toBe(false);
    expect(flagValue(settings.flags, 'sync', true)).toBe(true);
  });

  it('adds the first flag to a row that had none', async () => {
    await seedRowWithoutFlags();
    const repo = new DexieSettingsRepository();

    const updated = await repo.setFlag('sync', true);

    expect(updated.flags).toEqual({ sync: true });
    expect(updated.selectedCoachPersonality).toBe('zen');
    const reread = await repo.get();
    expect(reread.flags).toEqual({ sync: true });
  });

  it('keeps the other flags when one flag changes', async () => {
    const repo = new DexieSettingsRepository();

    await repo.setFlag('sync', true);
    await repo.setFlag('privateMode', true);
    await repo.setFlag('sync', false);

    const settings = await repo.get();
    expect(settings.flags).toEqual({ sync: false, privateMode: true });
  });

  it('keeps flags through an unrelated patch', async () => {
    const repo = new DexieSettingsRepository();
    await repo.setFlag('nudgeKinds', true);

    const patched = await repo.patch({ displayName: 'Yune' });

    expect(patched.flags).toEqual({ nudgeKinds: true });
    expect(patched.displayName).toBe('Yune');
  });

  it('gives a fresh row an empty flag set', async () => {
    const settings = await new DexieSettingsRepository().get();

    expect(settings.flags).toEqual({});
  });
});
