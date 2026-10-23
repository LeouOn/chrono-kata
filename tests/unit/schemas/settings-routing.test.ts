import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, LLMRoutingSchema, SettingsSchema } from '@/lib/schemas/settings';

const now = new Date('2026-10-23T12:00:00Z');

describe('provider routing on the settings row', () => {
  it('accepts a settings row written before routing existed', () => {
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.llmRouting).toBeUndefined();
  });

  it('accepts a default and per-feature overrides', () => {
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      llmRouting: {
        default: 'lmstudio',
        features: { dailyBriefing: 'lmstudio', weeklyReflection: 'openai' },
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llmRouting?.default).toBe('lmstudio');
      expect(result.data.llmRouting?.features?.dailyBriefing).toBe('lmstudio');
    }
  });

  it('rejects a route for a feature that does not exist', () => {
    const result = LLMRoutingSchema.safeParse({
      features: { notAFeature: 'lmstudio' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty provider name', () => {
    expect(LLMRoutingSchema.safeParse({ default: '' }).success).toBe(false);
    expect(LLMRoutingSchema.safeParse({ features: { dailyBriefing: '' } }).success).toBe(false);
  });
});
