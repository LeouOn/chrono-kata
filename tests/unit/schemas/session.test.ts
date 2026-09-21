import { describe, it, expect } from 'vitest';
import { SessionSchema } from '@/lib/schemas/session';

const validBase = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date('2026-07-21T10:00:00Z'),
  updatedAt: new Date('2026-07-21T10:00:00Z'),
} as const;

describe('SessionSchema', () => {
  it('accepts a timed session (durationMinutes set, reps null)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a 3.5 minute session with reps null', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 3.5,
      reps: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.durationMinutes).toBe(3.5);
  });

  it('rejects zero, negative, NaN, and infinite durations', () => {
    for (const durationMinutes of [0, -1, -3.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = SessionSchema.safeParse({
        ...validBase,
        durationMinutes,
        reps: null,
      });
      expect(result.success).toBe(false);
    }
  });

  it('accepts a reps session (reps set, durationMinutes null)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: null,
      reps: 108,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a session with both durationMinutes and reps set', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a session with neither durationMinutes nor reps set', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: null,
      reps: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid rating (6)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
