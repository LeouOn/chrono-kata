import { describe, it, expect } from 'vitest';
import { toLocalDateString, groupSessionsByDay } from '@/lib/utils/date';
import type { Session } from '@/lib/schemas/session';

describe('toLocalDateString', () => {
  it('formats a Date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 6, 21, 14, 30); // local Jul 21 2026 14:30
    expect(toLocalDateString(d)).toBe('2026-07-21');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 8, 0); // local Jan 5 2026
    expect(toLocalDateString(d)).toBe('2026-01-05');
  });
});

describe('groupSessionsByDay', () => {
  const baseSession = (id: string, startedAt: Date): Session => ({
    id,
    startedAt,
    durationMinutes: 30,
    reps: null,
    rating: 3,
    createdAt: startedAt,
    updatedAt: startedAt,
  });

  it('groups sessions by local YYYY-MM-DD', () => {
    const sessions = [
      baseSession('1', new Date(2026, 6, 21, 10, 0)),
      baseSession('2', new Date(2026, 6, 21, 14, 0)),
      baseSession('3', new Date(2026, 6, 20, 9, 0)),
    ];
    const grouped = groupSessionsByDay(sessions);
    expect(grouped.get('2026-07-21')).toHaveLength(2);
    expect(grouped.get('2026-07-20')).toHaveLength(1);
  });

  it('returns an empty map for no sessions', () => {
    expect(groupSessionsByDay([]).size).toBe(0);
  });
});
