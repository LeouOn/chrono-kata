import { describe, it, expect } from 'vitest';
import { isScheduledOn, dayProgress, isHabitDueToday, labelMatches } from '@/lib/habits/schedule';
import type { Habit, HabitLog } from '@/lib/schemas/habit';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Reading',
    icon: '📖',
    kind: 'count',
    unit: 'pages',
    targetPerDay: 10,
    schedule: { kind: 'daily' },
    order: 0,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

function log(overrides: Partial<HabitLog> = {}): HabitLog {
  return {
    id: crypto.randomUUID(),
    habitId: '123e4567-e89b-12d3-a456-426614174000',
    date: '2026-09-21',
    source: 'manual',
    createdAt: new Date('2026-09-21T10:00:00Z'),
    ...overrides,
  };
}

describe('isScheduledOn', () => {
  it('is true every day for daily habits', () => {
    const h = habit();
    expect(isScheduledOn(h, '2026-09-21')).toBe(true);
    expect(isScheduledOn(h, '2026-09-22')).toBe(true);
  });

  it('honours selected weekdays', () => {
    // 2026-09-21 is a Monday, 2026-09-23 a Wednesday, 2026-09-22 a Tuesday.
    const h = habit({ schedule: { kind: 'weekdays', days: ['mon', 'wed'] } });
    expect(isScheduledOn(h, '2026-09-21')).toBe(true);
    expect(isScheduledOn(h, '2026-09-23')).toBe(true);
    expect(isScheduledOn(h, '2026-09-22')).toBe(false);
  });
});

describe('isHabitDueToday', () => {
  it('is false for archived habits', () => {
    const h = habit({ archivedAt: new Date() });
    expect(isHabitDueToday(h, new Date('2026-09-21T12:00:00'))).toBe(false);
  });
});

describe('dayProgress', () => {
  it('sums count deltas against the target', () => {
    const h = habit();
    expect(dayProgress(h, [log({ delta: 4 }), log({ delta: 6 })]).complete).toBe(true);
    expect(dayProgress(h, [log({ delta: 4 })]).complete).toBe(false);
    expect(dayProgress(h, [log({ delta: 4 })]).value).toBe(4);
  });

  it('sums fractional timed minutes against the target', () => {
    const h = habit({ kind: 'timed', targetPerDay: 3.5, unit: undefined });
    const progress = dayProgress(h, [log({ minutes: 3.5 })]);
    expect(progress.value).toBe(3.5);
    expect(progress.complete).toBe(true);
  });

  it('treats boolean completion as any log', () => {
    const h = habit({ kind: 'boolean', targetPerDay: null, unit: undefined });
    expect(dayProgress(h, [log()]).complete).toBe(true);
    expect(dayProgress(h, []).complete).toBe(false);
  });

  it('aggregates two stretch sessions in one day', () => {
    const h = habit({ kind: 'timed', targetPerDay: 5, unit: undefined });
    const progress = dayProgress(h, [
      log({ minutes: 3.5, source: 'session' }),
      log({ minutes: 3.5, source: 'session' }),
    ]);
    expect(progress.value).toBe(7);
    expect(progress.complete).toBe(true);
  });
});

describe('labelMatches', () => {
  it('matches case-insensitively with surrounding whitespace', () => {
    expect(labelMatches('Daily Stretches', ' daily stretches ')).toBe(true);
    expect(labelMatches('daily stretches', 'Daily Stretches')).toBe(true);
    expect(labelMatches('daily stretches', 'Reading')).toBe(false);
    expect(labelMatches(null, 'Reading')).toBe(false);
    expect(labelMatches('Reading', null)).toBe(false);
  });
});
