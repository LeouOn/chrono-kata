import { describe, it, expect } from 'vitest';
import { SettingsSchema } from '@/lib/schemas/settings';

describe('SettingsSchema — backward compatibility', () => {
  it('parses a row from a pre-Wave-7 schema (no reminderTime, no notificationsEnabled)', () => {
    // Simulate an IndexedDB row that existed before Wave 7 added the new fields.
    const oldRow = {
      id: 'singleton' as const,
      selectedCoachPersonality: 'zen' as const,
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      // reminderTime: missing
      // notificationsEnabled: missing
    };

    const result = SettingsSchema.safeParse(oldRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reminderTime).toBeUndefined();
      expect(result.data.notificationsEnabled).toBeUndefined();
    }
  });

  it('accepts new fields when present (Wave 7+ rows)', () => {
    const newRow = {
      id: 'singleton' as const,
      selectedCoachPersonality: 'zen' as const,
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      reminderTime: '20:30',
      notificationsEnabled: true,
      createdAt: new Date('2026-07-21T00:00:00Z'),
      updatedAt: new Date('2026-07-21T00:00:00Z'),
    };
    const result = SettingsSchema.safeParse(newRow);
    expect(result.success).toBe(true);
  });

  it('rejects reminderTime not matching HH:MM pattern', () => {
    const result = SettingsSchema.safeParse({
      id: 'singleton' as const,
      selectedCoachPersonality: 'zen' as const,
      unlockedPersonalities: ['zen'],
      googleCalendarSyncEnabled: false,
      reminderTime: 'bad-time',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});