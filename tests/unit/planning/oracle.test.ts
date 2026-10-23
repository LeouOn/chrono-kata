/**
 * Brute-force oracle for the planning core (adopted from dev-lead's PR #37
 * review, which found the Auckland/Chatham DST bug and the overnight-anchor
 * bug that the hand-written tests missed).
 *
 * It does not trust the implementation's reasoning: for each day it scans every
 * real minute around that day to learn the true wall-clock -> instant mapping,
 * then checks `localWallClockToEpoch` for all 1440 clock times; it also checks
 * `computeCapacity` against a minute-by-minute sum over random days, anchors,
 * blocks and buffers; and it asserts that `rankPicks` does not subtract anchor
 * minutes that `computeCapacity` already removed.
 *
 * Each case sets `process.env.TZ` (restored afterwards), so the file runs under
 * any default zone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { computeCapacity } from '@/lib/planning/capacity';
import { expandAnchors } from '@/lib/planning/anchors';
import { localWallClockToEpoch } from '@/lib/planning/time';
import { rankPicks } from '@/lib/planning/rank-picks';
import type { Task } from '@/lib/schemas/task';

const ZONES = [
  'America/Los_Angeles',
  'Europe/Helsinki',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Australia/Lord_Howe',
  'Asia/Kolkata',
  'UTC',
] as const;

const CAPACITY_CASES_PER_ZONE = 30;

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clockOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
};

function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function makeScanner() {
  const cache = new Map<string, Map<string, number[]>>();
  return (key: string): Map<string, number[]> => {
    const hit = cache.get(key);
    if (hit) return hit;
    const [y, m, d] = key.split('-').map(Number);
    const base = Date.UTC(y!, m! - 1, d!, 0, 0);
    const map = new Map<string, number[]>();
    for (let t = base - 16 * 3_600_000; t <= base + 40 * 3_600_000; t += 60_000) {
      const dt = new Date(t);
      if (keyOf(dt) !== key) continue;
      const clock = clockOf(dt);
      const list = map.get(clock);
      if (list) list.push(t);
      else map.set(clock, [t]);
    }
    cache.set(key, map);
    return map;
  };
}

/** The documented policy, derived by brute force. null = cannot judge (gap off the day). */
function oracleEpoch(scan: ReturnType<typeof makeScanner>, key: string, clock: string): number | null {
  const map = scan(key);
  const hit = map.get(clock);
  if (hit) return Math.min(...hit);
  const minutes = toMin(clock);
  let lo = minutes;
  while (lo > 0 && !map.has(fmt(lo - 1))) lo -= 1;
  let hi = minutes;
  while (hi < 1439 && !map.has(fmt(hi + 1))) hi += 1;
  const gap = hi - lo + 1;
  const target = minutes + gap;
  if (target > 1439) return null;
  const times = map.get(fmt(target));
  return times ? Math.min(...times) : null;
}

/** Days worth testing: around every offset change in 2026, plus ordinary days. */
function interestingDays(scan: ReturnType<typeof makeScanner>): string[] {
  const days = new Set<string>();
  let previousOffset: number | null = null;
  for (let i = 0; i < 366; i += 1) {
    const key = addDaysKey('2026-01-01', i);
    const [y, m, d] = key.split('-').map(Number);
    const offset = new Date(Date.UTC(y!, m! - 1, d!, 12)).getTimezoneOffset();
    if (previousOffset !== null && offset !== previousOffset) {
      for (let j = -2; j <= 2; j += 1) days.add(addDaysKey(key, j));
    }
    previousOffset = offset;
  }
  days.add('2026-02-10');
  days.add('2026-06-17');
  days.add('2026-12-05');
  void scan;
  return [...days].sort();
}

function randomFactory(seedStart: number) {
  let seed = seedStart;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('planning oracle', () => {
  for (const zone of ZONES) {
    describe(zone, () => {
      it('resolves every wall clock like a minute-by-minute scan', () => {
        process.env.TZ = zone;
        const scan = makeScanner();
        const days = interestingDays(scan);
        const mismatches: string[] = [];
        let checked = 0;

        for (const key of days) {
          for (let minute = 0; minute < 1440; minute += 1) {
            const clock = fmt(minute);
            const want = oracleEpoch(scan, key, clock);
            if (want === null) continue;
            checked += 1;
            const got = localWallClockToEpoch(key, clock);
            if (got !== want) {
              mismatches.push(`${key} ${clock}: got ${new Date(got).toISOString()} want ${new Date(want).toISOString()}`);
            }
          }
        }

        expect(checked).toBeGreaterThan(1000);
        expect(mismatches.slice(0, 3)).toEqual([]);
      });

      it('computes capacity like a minute-by-minute scan', () => {
        process.env.TZ = zone;
        const scan = makeScanner();
        const days = interestingDays(scan);
        const random = randomFactory(20261023);
        const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
        const grid = Array.from({ length: 48 }, (_, i) => fmt(i * 30));

        const keyOfEpoch = (epoch: number) => keyOf(new Date(epoch));
        const dayStart = (key: string) => {
          const atMidnight = oracleEpoch(scan, key, '00:00');
          if (atMidnight !== null) return atMidnight;
          const atOne = oracleEpoch(scan, key, '01:00');
          return atOne ?? 0;
        };

        let wrong = 0;
        for (let caseIndex = 0; caseIndex < CAPACITY_CASES_PER_ZONE; caseIndex += 1) {
          const key = pick(days);
          const wakingHours = { start: pick(grid), end: pick(grid) };
          const anchors = Array.from({ length: Math.floor(random() * 4) }, (_, index) => ({
            id: `00000000-0000-4000-8000-00000000000${index}`,
            title: `a${index}`,
            weekdays: [0, 1, 2, 3, 4, 5, 6]
              .filter(() => random() < 0.6)
              .concat([Math.floor(random() * 7)])
              .filter((value, position, all) => all.indexOf(value) === position),
            start: pick(grid),
            end: pick(grid),
            domainId: null,
          }));

          const base = dayStart(key);
          const fixed = Array.from({ length: Math.floor(random() * 4) }, () => {
            const start = base - 3 * 3_600_000 + Math.floor(random() * 36 * 12) * 5 * 60_000;
            const length = (15 + Math.floor(random() * 16) * 15) * 60_000;
            return { start: new Date(start), end: new Date(start + length) };
          });
          const bufferPct = pick([0, 10, 25, 50]);

          const endsLater = toMin(wakingHours.end) > toMin(wakingHours.start);
          const windowStart = oracleEpoch(scan, key, wakingHours.start);
          const windowEnd = oracleEpoch(scan, endsLater ? key : addDaysKey(key, 1), wakingHours.end);
          if (windowStart === null || windowEnd === null) continue;

          const anchorInstances = (dates: string[]): Array<[number, number]> => {
            const spans: Array<[number, number]> = [];
            for (const anchor of anchors) {
              const crosses = toMin(anchor.end) <= toMin(anchor.start);
              for (const date of dates) {
                if (!anchor.weekdays.includes(weekdayOf(date))) continue;
                const start = oracleEpoch(scan, date, anchor.start);
                const end = oracleEpoch(scan, crosses ? addDaysKey(date, 1) : date, anchor.end);
                if (start === null || end === null || end <= start) continue;
                spans.push([start, end]);
              }
            }
            return spans;
          };
          // Anchors from yesterday, today and tomorrow, clipped to the window.
          const spans = anchorInstances([addDaysKey(key, -1), key, addDaysKey(key, 1)]);
          const fixedSpans = fixed.map((block) => [block.start.getTime(), block.end.getTime()] as [number, number]);

          let waking = 0;
          let occupied = 0;
          for (let t = windowStart; t < windowEnd; t += 60_000) {
            waking += 1;
            const inFixed = fixedSpans.some(([start, end]) => t >= start && t < end);
            const inAnchor = spans.some(([start, end]) => t >= start && t < end);
            if (inFixed || inAnchor) occupied += 1;
          }
          const free = Math.max(0, waking - occupied);
          const buffer = Math.min(free, Math.round((free * bufferPct) / 100));
          const expected = { freeMin: free, bufferMin: buffer, capacityMin: Math.max(0, free - buffer) };

          const got = computeCapacity({ day: key, wakingHours, fixedBlocks: fixed, anchors, bufferPct });
          if (
            got.wakingMin !== waking ||
            got.freeMin !== expected.freeMin ||
            got.bufferMin !== expected.bufferMin ||
            got.capacityMin !== expected.capacityMin
          ) {
            wrong += 1;
            if (wrong <= 2) {
              // Surface a readable example if this ever fails.
              expect({ key, wakingHours, got, expected, waking }).toEqual({});
            }
          }
          void keyOfEpoch;
        }
        expect(wrong).toBe(0);
      });

      it('does not subtract anchor minutes that capacity already removed', () => {
        process.env.TZ = zone;
        const anchors = [
          {
            id: '00000000-0000-4000-8000-000000000001',
            title: 'Lunch',
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            start: '12:00',
            end: '14:00',
            domainId: null,
          },
        ];
        const capacity = computeCapacity({
          day: '2026-06-17',
          wakingHours: { start: '07:00', end: '22:00' },
          fixedBlocks: [],
          anchors,
        });
        expect(capacity.capacityMin).toBeGreaterThanOrEqual(500);

        const task = {
          id: '99999999-9999-4999-8999-999999999999',
          title: 'big task',
          status: 'next',
          source: 'manual',
          estimateMin: 500,
          createdAt: new Date(2026, 5, 1),
          updatedAt: new Date(2026, 5, 1),
        } as unknown as Task;
        const picks = rankPicks({
          tasks: [task],
          projects: [],
          recentSessions: [],
          domainTime: {},
          capacity,
          now: new Date(2026, 5, 17, 9, 0),
          anchors: expandAnchors(anchors, '2026-06-17'),
        });
        expect(picks).toHaveLength(1);
      });
    });
  }
});
