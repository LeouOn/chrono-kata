import { describe, it, expect } from 'vitest';
import { SettingsSchema } from '@/lib/schemas/settings';

describe('SettingsSchema — Wave 9 theme migration', () => {
  const preWave9 = {
    id: 'singleton' as const,
    selectedCoachPersonality: 'zen' as const,
    unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
    googleCalendarSyncEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('parses pre-Wave-9 rows (no theme, no accentColor)', () => {
    const result = SettingsSchema.safeParse(preWave9);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBeUndefined();
      expect(result.data.accentColor).toBeUndefined();
    }
  });

  it('accepts valid theme modes', () => {
    for (const t of ['system', 'light', 'dark'] as const) {
      const result = SettingsSchema.safeParse({ ...preWave9, theme: t });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid theme mode', () => {
    const result = SettingsSchema.safeParse({ ...preWave9, theme: 'purple' });
    expect(result.success).toBe(false);
  });

  it('accepts valid accent colors', () => {
    for (const a of ['amber', 'sage', 'magenta', 'cyan'] as const) {
      const result = SettingsSchema.safeParse({ ...preWave9, accentColor: a });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid accent color', () => {
    const result = SettingsSchema.safeParse({ ...preWave9, accentColor: 'pink' });
    expect(result.success).toBe(false);
  });
});
