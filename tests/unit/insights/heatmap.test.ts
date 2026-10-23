import { describe, it, expect } from 'vitest';
import { buildHeatmapData } from '@/lib/insights/heatmap';
import type { Session } from '@/lib/schemas/session';

// Local-calendar instants so every timestamp keeps the same local date key in
// any runner timezone (ground rules: local YYYY-MM-DD date keys). A UTC literal
// like 10:00Z is the next local day in TZ=Pacific/Kiritimati (UTC+14).
const ses = (startedAt: Date, minutes = 30): Session => ({
  id: crypto.randomUUID(),
  startedAt,
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
      ses(new Date(2026, 2, 15, 10), 30),
      ses(new Date(2026, 2, 15, 14), 45),
      ses(new Date(2026, 2, 16, 10), 20),
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
      ses(new Date(2026, 2, 15, 10), 30),
      ses(new Date(2026, 2, 16, 10), 120),
    ];
    const data = buildHeatmapData(sessions, 2026);
    const mar15 = data.cells.find((c) => c.date === '2026-03-15')!;
    const mar16 = data.cells.find((c) => c.date === '2026-03-16')!;
    const empty = data.cells.find((c) => c.date === '2026-03-17')!;
    expect(empty.intensity).toBe(0);
    expect(mar16.intensity).toBe(4); // max
    expect(mar15.intensity).toBeGreaterThan(0);
    expect(mar15.intensity).toBeLessThan(4);
  });

  it('cells use local YYYY-MM-DD', () => {
    // 23:30 local is already the next day in UTC; the cell must use the local day.
    const sessions = [ses(new Date(2026, 2, 15, 23, 30))];
    const data = buildHeatmapData(sessions, 2026);
    expect(data.cells.find((c) => c.date === '2026-03-15')?.sessionCount).toBe(1);
    expect(data.cells.find((c) => c.date === '2026-03-16')?.sessionCount).toBe(0);
  });
});
