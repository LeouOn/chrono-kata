/**
 * Zones east of UTC+12 (Auckland +12/+13, Chatham +12:45/+13:45).
 *
 * The ±12h offset sampling used before review puts both samples on the same
 * side of a transition here, so a fall-back time resolved to the SECOND
 * occurrence (against the documented policy) and a spring-forward gap resolved
 * to the wrong instant. These cases fail with 12h sampling and pass with 14h.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { epochToLocalClock, localWallClockToEpoch } from '@/lib/planning/time';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}

describe('Pacific/Auckland', () => {
  it('resolves the first occurrence of a repeated fall-back time', () => {
    inZone('Pacific/Auckland', () => {
      const epoch = localWallClockToEpoch('2026-04-05', '02:30');
      expect(epochToLocalClock(epoch).clock).toBe('02:30');
      expect(new Date(epoch).toISOString()).toBe('2026-04-04T13:30:00.000Z');
    });
  });

  it('moves a nonexistent spring-forward time forward by the gap', () => {
    inZone('Pacific/Auckland', () => {
      // 02:00 -> 03:00 NZST -> NZDT; 02:30 becomes 03:30 local.
      const epoch = localWallClockToEpoch('2026-09-27', '02:30');
      expect(epochToLocalClock(epoch).clock).toBe('03:30');
      expect(new Date(epoch).toISOString()).toBe('2026-09-26T14:30:00.000Z');
    });
  });
});

describe('Pacific/Chatham (+12:45 / +13:45)', () => {
  it('resolves the first occurrence of a repeated fall-back time', () => {
    inZone('Pacific/Chatham', () => {
      const epoch = localWallClockToEpoch('2026-04-05', '02:30');
      expect(epochToLocalClock(epoch).clock).toBe('02:30');
      expect(new Date(epoch).toISOString()).toBe('2026-04-04T12:45:00.000Z');
    });
  });

  it('moves a nonexistent spring-forward time forward by the gap', () => {
    inZone('Pacific/Chatham', () => {
      // The gap is 02:45 -> 03:45, so 03:00 becomes 04:00 local.
      const epoch = localWallClockToEpoch('2026-09-27', '03:00');
      expect(epochToLocalClock(epoch).clock).toBe('04:00');
    });
  });
});
