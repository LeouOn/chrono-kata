import { describe, expect, it } from 'vitest';
import { buildYearlyConsistencyMatrix, summariseYearMatrix } from '@/lib/insights/yearly-matrix';
import type { Session } from '@/lib/schemas/session';

function session(id: string, startedAt: Date, minutes: number | null, reps: number | null = null): Session {
  return {
    id,
    startedAt,
    endedAt: null,
    durationMinutes: minutes,
    reps,
    rating: 3,
    createdAt: startedAt,
    updatedAt: startedAt,
  } as Session;
}

describe('summariseYearMatrix', () => {
  it('reads the year in words: sessions, active days, total and the busiest month', () => {
    const sessions = [
      session('11111111-1111-4111-8111-111111111111', new Date(2026, 0, 10, 9), 30),
      session('22222222-2222-4222-8222-222222222222', new Date(2026, 0, 20, 9), 30),
      session('33333333-3333-4333-8333-333333333333', new Date(2026, 5, 2, 9), 90),
      // A reps-only session counts as a session and a day, but adds no minutes.
      session('44444444-4444-4444-8444-444444444444', new Date(2026, 5, 3, 9), null, 20),
    ];
    const summary = summariseYearMatrix(buildYearlyConsistencyMatrix(sessions, 2026));

    expect(summary.sessions).toBe(4);
    // Four sessions on four different days (Jan 10, Jan 20, Jun 2, Jun 3).
    expect(summary.activeDays).toBe(4);
    expect(summary.minutes).toBe(150);
    expect(summary.busiest?.month).toBe('2026-06');
    expect(summary.busiest?.minutes).toBe(90);
    expect(summary.months.map((month) => month.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('has no busiest month for a year with no practice', () => {
    const summary = summariseYearMatrix(buildYearlyConsistencyMatrix([], 2026));
    expect(summary.sessions).toBe(0);
    expect(summary.busiest).toBeNull();
  });

  it('gives a tie to the earlier month, so the answer does not wobble', () => {
    const sessions = [
      session('55555555-5555-4555-8555-555555555555', new Date(2026, 2, 3, 9), 45),
      session('66666666-6666-4666-8666-666666666666', new Date(2026, 7, 3, 9), 45),
    ];
    const summary = summariseYearMatrix(buildYearlyConsistencyMatrix(sessions, 2026));
    expect(summary.busiest?.month).toBe('2026-03');
  });
});
