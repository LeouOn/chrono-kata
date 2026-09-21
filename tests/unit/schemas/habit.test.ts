import { describe, it, expect } from 'vitest';
import { HabitSchema, HabitLogSchema, HabitInputSchema, HabitLogInputSchema } from '@/lib/schemas/habit';

const baseHabit = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Water plants',
  kind: 'boolean',
  targetPerDay: null,
  schedule: { kind: 'daily' },
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

describe('HabitSchema', () => {
  it('accepts a boolean habit with no target', () => {
    const parsed = HabitSchema.parse(baseHabit);
    expect(parsed.icon).toBe('✅');
    expect(parsed.order).toBe(0);
    expect(parsed.archivedAt).toBeUndefined();
  });

  it('accepts a timed habit with a fractional target', () => {
    const parsed = HabitSchema.parse({
      ...baseHabit,
      name: 'Stretching',
      kind: 'timed',
      targetPerDay: 3.5,
    });
    expect(parsed.targetPerDay).toBe(3.5);
  });

  it('accepts a count habit with a named unit', () => {
    const parsed = HabitSchema.parse({
      ...baseHabit,
      name: 'Reading',
      kind: 'count',
      unit: 'pages',
      targetPerDay: 10,
    });
    expect(parsed.unit).toBe('pages');
  });

  it('rejects a boolean habit with a target', () => {
    const result = HabitSchema.safeParse({ ...baseHabit, targetPerDay: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects a timed habit without a target', () => {
    const result = HabitSchema.safeParse({ ...baseHabit, kind: 'timed', targetPerDay: null });
    expect(result.success).toBe(false);
  });

  it('rejects a count habit without a unit', () => {
    const result = HabitSchema.safeParse({ ...baseHabit, kind: 'count', targetPerDay: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects a weekday schedule with no days', () => {
    const result = HabitSchema.safeParse({
      ...baseHabit,
      schedule: { kind: 'weekdays', days: [] },
    });
    expect(result.success).toBe(false);
  });

  it('input schema omits id/timestamps and leaves icon to the repo default', () => {
    const input = HabitInputSchema.parse({
      name: 'Reading',
      kind: 'count',
      unit: 'pages',
      targetPerDay: 10,
      schedule: { kind: 'weekdays', days: ['mon', 'wed', 'fri'] },
    });
    expect(input).not.toHaveProperty('id');
    expect(input.icon).toBeUndefined();
  });
});

describe('HabitLogSchema', () => {
  const baseLog = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    habitId: '123e4567-e89b-12d3-a456-426614174000',
    date: '2026-09-21',
    createdAt: new Date('2026-09-21T10:00:00Z'),
  };

  it('accepts a manual boolean log', () => {
    const parsed = HabitLogSchema.parse({ ...baseLog });
    expect(parsed.source).toBe('manual');
  });

  it('accepts a timed log with fractional minutes', () => {
    const parsed = HabitLogSchema.parse({ ...baseLog, minutes: 3.5 });
    expect(parsed.minutes).toBe(3.5);
  });

  it('accepts a session-sourced log with sessionId', () => {
    const parsed = HabitLogSchema.parse({
      ...baseLog,
      minutes: 3.5,
      source: 'session',
      sessionId: '123e4567-e89b-12d3-a456-426614174002',
    });
    expect(parsed.source).toBe('session');
  });

  it('rejects a session-sourced log without sessionId', () => {
    const result = HabitLogSchema.safeParse({ ...baseLog, source: 'session' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = HabitLogSchema.safeParse({ ...baseLog, date: '2026-9-21' });
    expect(result.success).toBe(false);
  });

  it('input schema omits id/createdAt', () => {
    const input = HabitLogInputSchema.parse({ habitId: baseLog.habitId, date: '2026-09-21' });
    expect(input).not.toHaveProperty('id');
    expect(input).not.toHaveProperty('createdAt');
  });
});
