import { describe, expect, it } from 'vitest';
import { daysBetween, formatElapsed, formatMinuteAmount, scheduledHabits, shiftLocalDate } from '@/lib/habits/today';
import type { Habit } from '@/lib/schemas/habit';

function habit(partial: Partial<Habit> & Pick<Habit, 'name' | 'kind'>): Habit {
  return {
    id: partial.id ?? '123e4567-e89b-12d3-a456-426614174000',
    icon: '✅',
    schedule: { kind: 'daily' },
    order: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...partial,
  };
}

describe('today helpers', () => {
  it('shifts a local date across a month boundary', () => {
    expect(shiftLocalDate('2026-09-01', -1)).toBe('2026-08-31');
    expect(daysBetween('2026-09-15', '2026-09-21')).toBe(6);
  });

  it('formats a running clock and minute targets', () => {
    expect(formatElapsed(4 * 60_000 + 12_000)).toBe('4:12');
    expect(formatMinuteAmount(10)).toBe('10 min');
    expect(formatMinuteAmount(3.5)).toBe('3.5 min');
  });

  it('keeps archived habits and off-days off the schedule', () => {
    const habits = [
      habit({ name: 'Daily', kind: 'boolean' }),
      habit({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Weekday',
        kind: 'count',
        unit: 'pages',
        targetPerDay: 10,
        schedule: { kind: 'weekdays', days: ['mon'] },
      }),
      habit({
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: 'Old',
        kind: 'boolean',
        archivedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ];
    const sunday = scheduledHabits(habits, '2026-09-20');
    expect(sunday.map((item) => item.name)).toEqual(['Daily']);
    const monday = scheduledHabits(habits, '2026-09-21');
    expect(monday.map((item) => item.name)).toEqual(['Daily', 'Weekday']);
  });
});
