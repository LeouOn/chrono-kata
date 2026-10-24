import { afterEach, describe, expect, it } from 'vitest';
import { localHourMarks } from '@/components/timeline/Timeline';
import { localWallClockToEpoch } from '@/lib/planning/time';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function labels(start: number, end: number): string[] {
  return localHourMarks(start, end).map((instant) => {
    const date = new Date(instant);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  });
}

describe('timeline hour marks', () => {
  it('uses local clock hours in India, not UTC hours', () => {
    process.env.TZ = 'Asia/Kolkata';
    const start = localWallClockToEpoch('2026-06-15', '09:00');
    const end = localWallClockToEpoch('2026-06-15', '13:00');
    expect(labels(start, end)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00']);
  });

  it('uses local clock hours in Nepal (+5:45)', () => {
    process.env.TZ = 'Asia/Kathmandu';
    const start = localWallClockToEpoch('2026-06-15', '09:00');
    const end = localWallClockToEpoch('2026-06-15', '12:00');
    expect(labels(start, end)).toEqual(['09:00', '10:00', '11:00', '12:00']);
  });

  it('keeps 25 labels on a fall-back day and 23 on a spring-forward day', () => {
    process.env.TZ = 'America/Los_Angeles';
    const fallStart = localWallClockToEpoch('2026-11-01', '00:00');
    const fallEnd = localWallClockToEpoch('2026-11-02', '00:00');
    // Both midnights get a label, so a 25-hour day has 26 marks.
    expect(localHourMarks(fallStart, fallEnd)).toHaveLength(26);
    const springStart = localWallClockToEpoch('2026-03-08', '00:00');
    const springEnd = localWallClockToEpoch('2026-03-09', '00:00');
    expect(localHourMarks(springStart, springEnd)).toHaveLength(24);
  });
});
