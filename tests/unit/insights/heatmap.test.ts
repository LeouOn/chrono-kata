import { describe, it, expect } from 'vitest';
import { buildHeatmapData } from '@/lib/insights/heatmap';
import type { Session } from '@/lib/schemas/session';

const ses = (date: string, minutes = 30): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date(date),
  durationMinutes: minutes,
  reps: null,
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Session);

describe('buildHeatmapData', () => {
  it('returns 365/366 entries for a full year', () => {
    const data = buildHeatmapData([], 2026);
    // 2026 is not a leap year (2024 was) — 365 days
    expect(data.cells.length).toBe(365);
  });

  it('handles leap years (2024)', () => {
    const data = buildHeatmapData([], 2024);
    expect(data.cells.length).toBe(366);
  });

  it('aggregates minutes per day across multiple sessions', () => {
    const sessions = [
      ses('2026-03-15T10:00:00Z', 30),
      ses('2026-03-15T14:00:00Z', 45),
      ses('2026-03-16T10:00:00Z', 20),
    ];
    const data = buildHeatmapData(sessions, 2026);
    const mar15 = data.cells.find((c) => c.date === '2026-03-15');
    const mar16 = data.cells.find((c) => c.date === '2026-03-16');
    const mar17 = data.cells.find((c) => c.date === '2026-03-17');
    expect(mar15?.totalMinutes).toBe(75);
    expect(mar15?.sessionCount).toBe(2);
    expect(mar16?.totalMinutes).toBe(20);
    expect(mar16?.sessionCount).toBe(1);
    expect(mar17?.totalMinutes).toBe(0);
    expect(mar17?.sessionCount).toBe(0);
  });

  it('computes intensity level (0-4) based on max minutes in year', () => {
    const sessions = [
      ses('2026-03-15T10:00:00Z', 30),
      ses('2026-03-16T10:00:00Z', 120),
    ];
    const data = buildHeatmapData(sessions, 2026);
    const mar15 = data.cells.find((c) => c.date === '2026-03-15')!;
    const mar16 = data.cells.find((c) => c.date === '2026-03-16')!;
    const empty = data.cells.find((c) => c.date === '2026-03-17')!;
    expect(empty.intensity).toBe(0);
    expect(mar16.intensity).toBe(4); // max
    expect(mar15.intensity).toBeGreaterThan(0).and.toBeLessThan(4);
  });

  it('cells use local YYYY-MM-DD', () => {
    const sessions = [ses('2026-03-15T10:00:00Z')];
    const data = buildHeatmapData(sessions, 2026);
    // The local date string is what matters, not the UTC interpretation
    expect(data.cells.some((c) => c.sessionCount === 1)).toBe(true);
  });
});
