import { describe, expect, it } from 'vitest';
import { KataTemplateSchema } from '@/lib/schemas/kata-template';

const baseTemplate = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Morning Zazen',
  mode: 'timed',
  defaultDurationMinutes: 20,
  defaultReps: null,
  icon: '🧘',
  order: 0,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

describe('KataTemplateSchema intensity', () => {
  it('accepts intensity 1, 2, and 3', () => {
    for (const intensity of [1, 2, 3] as const) {
      expect(KataTemplateSchema.parse({ ...baseTemplate, intensity }).intensity).toBe(intensity);
    }
  });

  it('keeps intensity optional', () => {
    expect(KataTemplateSchema.parse(baseTemplate).intensity).toBeUndefined();
  });

  it('rejects out-of-range intensity values', () => {
    expect(KataTemplateSchema.safeParse({ ...baseTemplate, intensity: 0 }).success).toBe(false);
    expect(KataTemplateSchema.safeParse({ ...baseTemplate, intensity: 4 }).success).toBe(false);
    expect(KataTemplateSchema.safeParse({ ...baseTemplate, intensity: '2' }).success).toBe(false);
  });
});
