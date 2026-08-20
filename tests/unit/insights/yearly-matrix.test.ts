import { describe, it, expect } from 'vitest';
import {
  buildYearlyConsistencyMatrix,
  calculateIntensity,
} from '@/lib/insights/yearly-matrix';
import type { Session } from '@/lib/schemas/session';

function createSession(dateStr: string, minutes: number, reps?: number, label?: string): Session {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    id: crypto.randomUUID(),
    startedAt: d,
    endedAt: new Date(d.getTime() + minutes * 60000),
    durationMinutes: minutes,
    reps: reps ?? null,
    rating: 4,
    activityLabel: label,
    createdAt: d,
    updatedAt: d,
  };
}

describe('Yearly Consistency Matrix Generator', () => {
  it('correctly maps intensity tiers', () => {
    expect(calculateIntensity(0, 0)).toBe(0);
    expect(calculateIntensity(10, 0)).toBe(1);
    expect(calculateIntensity(20, 0)).toBe(2);
    expect(calculateIntensity(45, 0)).toBe(3);
    expect(calculateIntensity(75, 0)).toBe(4);
    expect(calculateIntensity(0, 150)).toBe(4);
  });

  it('builds a complete 52+ week grid with aggregate statistics', () => {
    const year = 2026;
    const sessions: Session[] = [
      createSession('2026-01-05', 30, 0, 'Meditation'),
      createSession('2026-01-06', 45, 0, 'Kata Practice'),
      createSession('2026-06-15', 60, 0, 'Deep Work'),
      createSession('2026-12-31', 20, 0, 'Meditation'),
      createSession('2025-12-25', 50, 0, 'Other Year'), // Should be ignored
    ];

    const result = buildYearlyConsistencyMatrix(sessions, year);

    expect(result.year).toBe(2026);
    expect(result.weeks.length).toBeGreaterThanOrEqual(52);
    expect(result.totalPracticedDays).toBe(4);
    expect(result.totalMinutesInYear).toBe(155);
    expect(result.totalSessionsInYear).toBe(4);

    // Verify all weeks have exactly 7 days
    for (const week of result.weeks) {
      expect(week.length).toBe(7);
    }
  });
});
