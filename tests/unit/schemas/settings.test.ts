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
});
