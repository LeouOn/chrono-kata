import { describe, it, expect } from 'vitest';
import { SettingsSchema, DEFAULT_SETTINGS } from '@/lib/schemas/settings';

describe('SettingsSchema', () => {
  it('accepts the default settings with timestamps', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it('rejects displayName over 50 chars', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      displayName: 'a'.repeat(51),
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid coach personality', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      selectedCoachPersonality: 'invalid',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it('defaults all confirmation toggles to true', () => {
    expect(DEFAULT_SETTINGS.confirmKataDelete).toBe(true);
    expect(DEFAULT_SETTINGS.confirmSessionDelete).toBe(true);
    expect(DEFAULT_SETTINGS.confirmClearData).toBe(true);
  });

  it('parses confirmation toggles set to false', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      confirmKataDelete: false,
      confirmSessionDelete: false,
      confirmClearData: false,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmKataDelete).toBe(false);
      expect(result.data.confirmSessionDelete).toBe(false);
      expect(result.data.confirmClearData).toBe(false);
    }
  });

  it('rejects non-boolean confirmation toggles', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      confirmKataDelete: 'yes',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});
