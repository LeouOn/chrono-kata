import { describe, it, expect } from 'vitest';
import { anchorCrossesMidnight, anchorIntervalsOnDay, expandAnchors } from '@/lib/planning/anchors';
import { epochToLocalClock, localWallClockToEpoch } from '@/lib/planning/time';
import type { Anchor } from '@/lib/schemas/settings';

function anchor(partial: Partial<Anchor> = {}): Anchor {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Trading session',
    // 1 = Monday
    weekdays: [1],
    start: '09:00',
    end: '11:00',
    ...partial,
  };
}

describe('anchorCrossesMidnight', () => {
  it('knows when the end is at or before the start', () => {
    expect(anchorCrossesMidnight({ start: '09:00', end: '11:00' })).toBe(false);
    expect(anchorCrossesMidnight({ start: '22:00', end: '02:00' })).toBe(true);
    expect(anchorCrossesMidnight({ start: '22:00', end: '22:00' })).toBe(true);
  });
});

describe('expandAnchors', () => {
  it('returns nothing on a day the anchor does not run', () => {
    const intervals = expandAnchors([anchor()], '2026-06-16'); // Tuesday
    expect(intervals).toEqual([]);
  });

  it('expands an anchor on the day it runs', () => {
    const intervals = expandAnchors([anchor()], '2026-06-15'); // Monday
    expect(intervals).toHaveLength(1);
    expect(epochToLocalClock(intervals[0]!.start.getTime())).toEqual({
      dayKey: '2026-06-15',
      clock: '09:00',
    });
    expect(epochToLocalClock(intervals[0]!.end.getTime())).toEqual({
      dayKey: '2026-06-15',
      clock: '11:00',
    });
  });

  it('includes the tail of an anchor that crossed midnight yesterday', () => {
    const nightly = anchor({ start: '22:00', end: '02:00', weekdays: [1, 2, 3, 4, 5] });
    // Tuesday: the tail of Monday night plus Tuesday's own start.
    const intervals = expandAnchors([nightly], '2026-06-16');
    expect(intervals).toHaveLength(2);

    const tail = intervals[0]!;
    expect(epochToLocalClock(tail.start.getTime())).toEqual({ dayKey: '2026-06-16', clock: '00:00' });
    expect(epochToLocalClock(tail.end.getTime())).toEqual({ dayKey: '2026-06-16', clock: '02:00' });

    const own = intervals[1]!;
    expect(epochToLocalClock(own.start.getTime())).toEqual({ dayKey: '2026-06-16', clock: '22:00' });
    // The piece is clipped to the day, so it ends at midnight.
    expect(epochToLocalClock(own.end.getTime())).toEqual({ dayKey: '2026-06-17', clock: '00:00' });
  });

  it('has no tail when the previous day was not one of the anchor days', () => {
    const nightly = anchor({ start: '22:00', end: '02:00', weekdays: [1] }); // Mondays only
    // Tuesday: only the piece that starts tonight, no tail from Monday? Monday ran,
    // so there IS a tail. Use Sunday instead: no anchor on Saturday night.
    const sunday = expandAnchors([nightly], '2026-06-14'); // Sunday
    expect(sunday).toEqual([]);
  });

  it('keeps the domain with the interval', () => {
    const withDomain = anchor({ domainId: '22222222-2222-4222-8222-222222222222' });
    const intervals = expandAnchors([withDomain], '2026-06-15');
    expect(intervals[0]?.domainId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('sorts the intervals by start time', () => {
    const morning = anchor({ id: '33333333-3333-4333-8333-333333333333', title: 'Morning', start: '07:00', end: '08:00' });
    const evening = anchor({ id: '44444444-4444-4444-8444-444444444444', title: 'Evening', start: '20:00', end: '21:00' });
    const intervals = expandAnchors([evening, morning], '2026-06-15');
    expect(intervals.map((i) => i.title)).toEqual(['Morning', 'Evening']);
  });
});

describe('anchorIntervalsOnDay', () => {
  it('clips an interval to the day', () => {
    const nightly = anchor({ start: '22:00', end: '02:00', weekdays: [1, 2, 3, 4, 5] });
    const pieces = anchorIntervalsOnDay(nightly, '2026-06-15'); // Monday
    for (const piece of pieces) {
      expect(piece.start.getTime()).toBeGreaterThanOrEqual(
        localWallClockToEpoch('2026-06-15', '00:00'),
      );
      expect(piece.end.getTime()).toBeLessThanOrEqual(
        localWallClockToEpoch('2026-06-16', '00:00'),
      );
    }
  });
});
