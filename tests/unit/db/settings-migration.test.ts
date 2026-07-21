import { describe, it, expect, beforeEach } from 'vitest';
import { DexieSettingsRepository } from '@/lib/db/settings.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('settingsRepo — real IndexedDB migration path', () => {
  it('reads a pre-Wave-7 row (no reminderTime, no notificationsEnabled) without throwing', async () => {
    // Seed IndexedDB directly with an old-shape row, bypassing the repo's get()
    // init logic. This simulates the scenario where a user already has data
    // in IndexedDB from before Wave 7 added the new fields.
    const db = (await import('@/lib/db/db')).getDb();
    await db.settings.put({
      id: 'singleton',
      displayName: 'Yune',
      selectedCoachPersonality: 'zen',
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      // No reminderTime, no notificationsEnabled — these are missing.
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    });

    const repo = new DexieSettingsRepository();
    const settings = await repo.get();

    // The old row is returned as-is; undefined fields are accepted because
    // they're optional in the schema.
    expect(settings.displayName).toBe('Yune');
    expect(settings.selectedCoachPersonality).toBe('zen');
    expect(settings.reminderTime).toBeUndefined();
    expect(settings.notificationsEnabled).toBeUndefined();
  });

  it('preserves old fields and adds new fields on patch() of an old row', async () => {
    const db = (await import('@/lib/db/db')).getDb();
    await db.settings.put({
      id: 'singleton',
      selectedCoachPersonality: 'hype',
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    });

    const repo = new DexieSettingsRepository();
    const patched = await repo.patch({
      reminderTime: '20:30',
      notificationsEnabled: true,
    });

    expect(patched.selectedCoachPersonality).toBe('hype');
    expect(patched.reminderTime).toBe('20:30');
    expect(patched.notificationsEnabled).toBe(true);
    expect(patched.id).toBe('singleton');
    expect(patched.updatedAt.getTime()).toBeGreaterThan(
      new Date('2026-07-01T00:00:00Z').getTime()
    );
  });

  it('initializes a fresh row with all DEFAULT_SETTINGS fields including Wave 7 fields', async () => {
    // No seeded row — get() should write a fresh one with DEFAULT_SETTINGS.
    const repo = new DexieSettingsRepository();
    const settings = await repo.get();

    // DEFAULT_SETTINGS includes the Wave 7 fields, so fresh rows have them.
    expect(settings.reminderTime).toBe(DEFAULT_SETTINGS.reminderTime);
    expect(settings.notificationsEnabled).toBe(DEFAULT_SETTINGS.notificationsEnabled);
    expect(settings.selectedCoachPersonality).toBe('zen');
    expect(settings.id).toBe('singleton');
  });

  it('reads back the freshly-initialized row and it matches the seeded defaults', async () => {
    const repo = new DexieSettingsRepository();
    await repo.get(); // initialize

    // Read again — should return the same row (now in DB).
    const second = await repo.get();
    expect(second.reminderTime).toBeNull();
    expect(second.notificationsEnabled).toBe(false);
  });
});