import { describe, expect, it } from 'vitest';
import { daysUntouched, isUntouchedFor, WAITING_AFTER_DAYS } from '@/lib/planning/untouched';
import { daysBetweenDayKeys } from '@/lib/pacing/days';
import {
  DST_WEEK_MONDAYS,
  ZONES,
  dayKeys,
  inZone,
  intlDayKey,
  keyDiff,
  local,
  seeded,
  weekdayOf,
} from './w10-helpers';

describe('fixture sanity: the DST-week table', () => {
  it('lists Mondays, and every DST zone really changes clocks that week', () => {
    for (const zone of ZONES) {
      for (const monday of DST_WEEK_MONDAYS[zone]) {
        expect(weekdayOf(monday), `${zone} ${monday}`).toBe(1);
      }
    }
    const hasShortOrLongDay = (zone: (typeof ZONES)[number], monday: string) =>
      inZone(zone, () =>
        dayKeys(monday, 7).some((key) => {
          const start = local(key, 0, 0).getTime();
          const nextStart = local(dayKeys(key, 2)[1]!, 0, 0).getTime();
          return nextStart - start !== 86_400_000;
        }),
      );
    for (const zone of ['Europe/Helsinki', 'America/Los_Angeles', 'Pacific/Auckland'] as const) {
      for (const monday of DST_WEEK_MONDAYS[zone]) {
        expect(hasShortOrLongDay(zone, monday), `${zone} ${monday} has a 23h or 25h day`).toBe(true);
      }
    }
  });
});

describe('daysBetweenDayKeys', () => {
  it('counts calendar days, signed, across month, year and leap boundaries', () => {
    expect(daysBetweenDayKeys('2026-10-24', '2026-10-24')).toBe(0);
    expect(daysBetweenDayKeys('2026-10-24', '2026-10-25')).toBe(1);
    expect(daysBetweenDayKeys('2026-10-25', '2026-10-24')).toBe(-1);
    expect(daysBetweenDayKeys('2026-02-27', '2026-03-02')).toBe(3);
    expect(daysBetweenDayKeys('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetweenDayKeys('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('daysUntouched', () => {
  it('is 0 on the day of the touch, however late the evening', () => {
    inZone('Europe/Helsinki', () => {
      expect(daysUntouched(local('2026-06-10', 0, 1), local('2026-06-10', 23, 59))).toBe(0);
    });
  });

  it('turns over at local midnight, not after 24 elapsed hours', () => {
    inZone('Europe/Helsinki', () => {
      const touched = local('2026-06-10', 23, 59);
      expect(daysUntouched(touched, local('2026-06-11', 0, 1))).toBe(1);
      expect(daysUntouched(touched, local('2026-06-24', 0, 1))).toBe(14);
    });
  });

  it('treats a touch in the future, or an unreadable date, as today', () => {
    inZone('UTC', () => {
      expect(daysUntouched(local('2026-06-20'), local('2026-06-10'))).toBe(0);
      expect(daysUntouched(new Date('not a date'), local('2026-06-10'))).toBe(0);
      expect(daysUntouched(local('2026-06-10'), new Date('not a date'))).toBe(0);
    });
  });

  it('is not moved by a DST change: a 14 day gap stays 14 days', () => {
    // Helsinki springs forward 2026-03-29, so these 14 calendar days contain
    // only 14*24 - 1 elapsed hours. An elapsed-time rule says "not yet".
    inZone('Europe/Helsinki', () => {
      const touched = local('2026-03-22', 0, 30);
      const now = local('2026-04-05', 0, 10);
      expect(now.getTime() - touched.getTime()).toBeLessThan(14 * 86_400_000);
      expect(daysUntouched(touched, now)).toBe(14);
      expect(isUntouchedFor(touched, now, WAITING_AFTER_DAYS)).toBe(true);
    });
    // And the other direction: Auckland falls back 2026-04-05, a 25-hour day.
    inZone('Pacific/Auckland', () => {
      const touched = local('2026-03-30', 23, 50);
      const now = local('2026-04-06', 0, 5);
      expect(daysUntouched(touched, now)).toBe(7);
    });
  });

  it('shares the waiting rule with the weekly review: 14 days', () => {
    expect(WAITING_AFTER_DAYS).toBe(14);
  });
});

describe('daysUntouched agrees with an independent oracle (Intl, explicit zone)', () => {
  for (const zone of ZONES) {
    it(`holds in ${zone}: 600 random pairs, DST weeks included`, () => {
      inZone(zone, () => {
        const random = seeded(0x10c0ffee);
        const anchors = ['2026-06-15', ...DST_WEEK_MONDAYS[zone]];
        for (let i = 0; i < 600; i += 1) {
          const base = local(random.pick(anchors), 0, 0).getTime();
          // Touches within +-3 days of the anchor, any minute (midnight included).
          const touched = new Date(base + random.int(-3 * 1440, 3 * 1440) * 60_000);
          const now = new Date(touched.getTime() + random.int(0, 20 * 1440) * 60_000);
          const expected = Math.max(0, keyDiff(intlDayKey(touched, zone), intlDayKey(now, zone)));
          expect(daysUntouched(touched, now), `${zone} ${touched.toISOString()} -> ${now.toISOString()}`).toBe(expected);
          for (const n of [1, 7, 14]) {
            expect(isUntouchedFor(touched, now, n)).toBe(expected >= n);
          }
        }
      });
    });
  }
});
