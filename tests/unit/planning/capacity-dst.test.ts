/**
 * Capacity across DST transitions, in the two zones the roadmap names.
 *
 * Each case sets TZ itself (the pattern from tests/unit/tz/date-tz.test.ts), so
 * the file runs under any default zone. A day that is 23 or 25 hours long must
 * contribute its REAL elapsed minutes, and an overnight waking window (or an
 * anchor crossing midnight) must follow the clock, not assume 24h days.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { computeCapacity } from '@/lib/planning/capacity';
import { expandAnchors } from '@/lib/planning/anchors';
import { localWallClockToEpoch, epochToLocalClock } from '@/lib/planning/time';
import type { Anchor } from '@/lib/schemas/settings';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}

function anchor(partial: Partial<Anchor> = {}): Anchor {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Anchor',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start: '22:00',
    end: '03:00',
    ...partial,
  };
}

describe('overnight waking window across a DST change', () => {
  it('America/Los_Angeles spring forward: 22:00 -> 07:00 is 8 real hours', () => {
    inZone('America/Los_Angeles', () => {
      // 2026-03-08 02:00 PST -> 03:00 PDT.
      const result = computeCapacity({
        day: '2026-03-07',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [],
      });
      expect(result.wakingMin).toBe(480);
    });
  });

  it('America/Los_Angeles fall back: 22:00 -> 07:00 is 10 real hours', () => {
    inZone('America/Los_Angeles', () => {
      // 2026-11-01 02:00 PDT -> 01:00 PST.
      const result = computeCapacity({
        day: '2026-10-31',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [],
      });
      expect(result.wakingMin).toBe(600);
    });
  });

  it('Europe/Helsinki spring forward: 22:00 -> 07:00 is 8 real hours', () => {
    inZone('Europe/Helsinki', () => {
      // 2026-03-29 03:00 EET -> 04:00 EEST.
      const result = computeCapacity({
        day: '2026-03-28',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [],
      });
      expect(result.wakingMin).toBe(480);
    });
  });

  it('Europe/Helsinki fall back: 22:00 -> 07:00 is 10 real hours', () => {
    inZone('Europe/Helsinki', () => {
      // 2026-10-25 04:00 EEST -> 03:00 EET.
      const result = computeCapacity({
        day: '2026-10-24',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [],
      });
      expect(result.wakingMin).toBe(600);
    });
  });
});

describe('an anchor crossing midnight on a DST change', () => {
  it('counts the real tail on the spring-forward morning', () => {
    inZone('America/Los_Angeles', () => {
      // Tail of 2026-03-07 22:00 -> 03:00 on 2026-03-08: 00:00 -> 03:00 local
      // spans the skipped 02:00, so it is 120 real minutes, not 180.
      const pieces = expandAnchors([anchor()], '2026-03-08');
      // Tail (00:00 -> 03:00) plus the recurring start tonight (22:00 -> 23:59).
      const tail = pieces.find((piece) => epochToLocalClock(piece.start.getTime()).clock === '00:00');
      expect(tail).toBeDefined();
      expect((tail!.end.getTime() - tail!.start.getTime()) / 60_000).toBe(120);
    });
  });

  it('counts the real tail on the fall-back morning', () => {
    inZone('America/Los_Angeles', () => {
      // Tail of 2026-10-31 22:00 -> 03:00 on 2026-11-01: 00:00 -> 03:00 local
      // repeats 01:00, so it is 240 real minutes.
      const pieces = expandAnchors([anchor()], '2026-11-01');
      const tail = pieces.find((piece) => epochToLocalClock(piece.start.getTime()).clock === '00:00');
      expect(tail).toBeDefined();
      expect((tail!.end.getTime() - tail!.start.getTime()) / 60_000).toBe(240);
    });
  });
});

describe('a wall clock inside a DST gap or repeat', () => {
  it('moves a nonexistent spring-forward time forward by the gap', () => {
    inZone('America/Los_Angeles', () => {
      // 02:30 does not exist on 2026-03-08; it resolves to the instant that is
      // 03:30 local, as calendars do.
      const epoch = localWallClockToEpoch('2026-03-08', '02:30');
      expect(epochToLocalClock(epoch).clock).toBe('03:30');
    });
  });

  it('uses the first of the two repeated fall-back times', () => {
    inZone('America/Los_Angeles', () => {
      const first = localWallClockToEpoch('2026-11-01', '01:30');
      const second = localWallClockToEpoch('2026-11-01', '01:30');
      expect(first).toBe(second);
      // Still 01:30 local, and the earlier instant: 08:30Z, before the fallback.
      expect(epochToLocalClock(first).clock).toBe('01:30');
      expect(new Date(first).toISOString()).toBe('2026-11-01T08:30:00.000Z');
    });
  });
});
