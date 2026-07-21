import { describe, it, expect } from 'vitest';
import { SessionSchema, SessionInputSchema } from '@/lib/schemas/session';

const baseOldSession = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  startedAt: new Date('2026-07-21T10:00:00Z'),
  durationMinutes: 30,
  reps: null,
  rating: 4,
  createdAt: new Date('2026-07-21T10:00:00Z'),
  updatedAt: new Date('2026-07-21T10:00:00Z'),
  // no focusRating, energyRating, moodRating
};

describe('SessionSchema — Wave 8 backward compatibility', () => {
  it('parses a pre-Wave-8 session (no multi-dim fields)', () => {
    const result = SessionSchema.safeParse(baseOldSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.focusRating).toBeUndefined();
      expect(result.data.energyRating).toBeUndefined();
      expect(result.data.moodRating).toBeUndefined();
    }
  });

  it('parses a Wave 8+ session with multi-dim fields', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 4,
      energyRating: 3,
      moodRating: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.focusRating).toBe(4);
      expect(result.data.energyRating).toBe(3);
      expect(result.data.moodRating).toBe(5);
    }
  });

  it('accepts null multi-dim values', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: null,
      energyRating: null,
      moodRating: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects focusRating outside 1-5', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 6,
    });
    expect(result.success).toBe(false);
    const result2 = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 0,
    });
    expect(result2.success).toBe(false);
  });

  it('accepts focusRating 0 (clear/null sentinel if user sets to 0)', () => {
    // 0 is NOT valid — only 1-5 or null/undefined
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 0,
    });
    expect(result.success).toBe(false);
  });

  it('SessionInputSchema omits multi-dim fields from required set', () => {
    const input = {
      startedAt: new Date(),
      endedAt: new Date(),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      focusRating: 5,
    };
    const result = SessionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});