/**
 * Invariant tests for the layout core: random inputs, seven zones (including
 * Auckland, Chatham and Lord Howe), DST-change days, and 50 input shuffles.
 *
 * These assert properties, not examples: no overlaps, everything inside the
 * window on the step grid, fixed blocks and foreign-domain anchors respected,
 * every pick accounted for exactly once, and identical output regardless of
 * input order.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  MIN_GAP_MIN,
  proposeLayout,
  type PickForLayout,
} from '@/lib/planning/layout';
import { localWallClockToEpoch } from '@/lib/planning/time';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const MIN = 60_000;
const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Europe/Helsinki',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Australia/Lord_Howe',
  'Pacific/Kiritimati',
] as const;
const DST_DAYS: Record<string, string[]> = {
  'America/Los_Angeles': ['2026-03-08', '2026-11-01'],
  'Europe/Helsinki': ['2026-03-29', '2026-10-25'],
  'Pacific/Auckland': ['2026-04-05', '2026-09-27'],
};
const DOMAIN_A = '44444444-4444-4444-8444-444444444444';
const DOMAIN_B = '55555555-5555-4555-8555-555555555555';

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

interface Case {
  day: string;
  window: { start: number; end: number };
  fixedBlocks: { start: number; end: number }[];
  anchors: { start: number; end: number; domainId: string | null }[];
  picks: PickForLayout[];
  now: number;
  stepMin: number;
}

function makeCase(random: () => number, day: string): Case {
  const pickOf = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const startClock = pickOf(['07:00', '09:00', '10:00', '13:00', '20:00']);
  const overnight = startClock === '20:00';
  const endClock = overnight ? '02:00' : pickOf(['15:00', '17:00', '21:00']);
  const window = {
    start: localWallClockToEpoch(day, startClock),
    end: localWallClockToEpoch(overnight ? nextDay(day) : day, endClock),
  };
  const stepMin = pickOf([5, 15]);
  const span = window.end - window.start;
  const at = () => window.start + Math.floor(random() * (span / (5 * MIN))) * 5 * MIN;
  const fixedBlocks = Array.from({ length: Math.floor(random() * 3) }, () => {
    const start = at();
    return { start, end: start + (15 + Math.floor(random() * 8) * 5) * MIN };
  });
  const anchors = Array.from({ length: Math.floor(random() * 3) }, () => {
    const start = at();
    return {
      start,
      end: start + (30 + Math.floor(random() * 6) * 15) * MIN,
      domainId: pickOf([null, DOMAIN_A, DOMAIN_B]),
    };
  });
  const picks = Array.from({ length: Math.floor(random() * 6) }, (_, index) => ({
    id: `${index % 2 === 0 ? '11111111' : '22222222'}-1111-4111-8111-${String(index).padStart(12, '0')}`,
    estimateMin: 5 + Math.floor(random() * 90),
    energy: pickOf(['low', 'med', 'high'] as const),
    domainId: pickOf([null, DOMAIN_A, DOMAIN_B]),
    createdAt: new Date(2026, 0, 1, 9, 0, index),
  }));

  return {
    day,
    window,
    fixedBlocks,
    anchors,
    picks,
    now: window.start + Math.floor(random() * (span / (10 * MIN))) * 10 * MIN,
    stepMin,
  };
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function freeMinutes(c: Case): number {
  const blocked: { start: number; end: number }[] = [...c.fixedBlocks, ...c.anchors];
  blocked.sort((a, b) => a.start - b.start);
  let occupied = 0;
  let cursor: number | null = null;
  let end = 0;
  for (const block of blocked) {
    if (cursor === null) {
      cursor = block.start;
      end = block.end;
      continue;
    }
    if (block.start <= end) {
      end = Math.max(end, block.end);
      continue;
    }
    occupied += end - cursor;
    cursor = block.start;
    end = block.end;
  }
  if (cursor !== null) occupied += end - cursor;
  return Math.round((c.window.end - c.window.start - occupied) / MIN);
}

function assertInvariants(c: Case, result: ReturnType<typeof proposeLayout>) {
  const grid = c.stepMin * MIN;
  const origin = c.window.start;
  const sorted = [...result.blocks].sort((a, b) => a.start - b.start);

  for (const block of sorted) {
    expect(block.start).toBeGreaterThanOrEqual(Math.max(c.now, c.window.start));
    expect(block.end).toBeLessThanOrEqual(c.window.end);
    expect((block.start - origin) % grid).toBe(0);
    expect((block.end - origin) % grid).toBe(0);
    expect(block.end - block.start).toBeGreaterThanOrEqual(grid);
    for (const fixed of c.fixedBlocks) {
      expect(block.start >= fixed.end || block.end <= fixed.start).toBe(true);
    }
  }

  for (let i = 1; i < sorted.length; i += 1) {
    expect(sorted[i]!.start - sorted[i - 1]!.end).toBeGreaterThanOrEqual(MIN_GAP_MIN * MIN);
  }

  // Foreign-domain anchors are respected for every pick.
  const pickById = new Map(c.picks.map((pick) => [pick.id, pick] as const));
  for (const block of sorted) {
    const pick = pickById.get(block.taskId)!;
    for (const anchor of c.anchors) {
      const blocksThisPick = !anchor.domainId || anchor.domainId !== (pick.domainId ?? null);
      if (!blocksThisPick) continue;
      expect(block.start >= anchor.end || block.end <= anchor.start).toBe(true);
    }
  }

  // Every pick accounted for exactly once.
  const placed = result.blocks.map((block) => block.taskId);
  const unplaced = result.unplaced.map((pick) => pick.id);
  const all = [...placed, ...unplaced];
  expect(new Set(all).size).toBe(all.length);
  expect(new Set(all)).toEqual(new Set(c.picks.map((pick) => pick.id)));

  // Placed minutes never exceed the available free minutes.
  const placedMinutes = result.blocks.reduce((sum, block) => sum + (block.end - block.start) / MIN, 0);
  expect(placedMinutes).toBeLessThanOrEqual(freeMinutes(c) + 1);
}

describe('proposeLayout invariants', () => {
  for (const zone of ZONES) {
    it(`holds in ${zone} (ordinary and DST days, 40 random cases)`, () => {
      process.env.TZ = zone;
      const random = randomFactory(0xc0ffee);
      const days = ['2026-06-15', ...(DST_DAYS[zone] ?? [])];
      for (let i = 0; i < 40; i += 1) {
        const day = days[i % days.length]!;
        const c = makeCase(random, day);
        const result = proposeLayout(c);
        assertInvariants(c, result);
        // On a DST day a placed block's real elapsed minutes equal its size.
        for (const block of result.blocks) {
          expect((block.end - block.start) % (c.stepMin * MIN)).toBe(0);
        }
      }
    });
  }

  it('is identical over 50 shuffles of the input', () => {
    process.env.TZ = 'America/Los_Angeles';
    const random = randomFactory(42);
    const c = makeCase(random, '2026-11-01');
    const baseline = proposeLayout(c);
    const baselineKey = JSON.stringify({
      blocks: baseline.blocks,
      unplaced: baseline.unplaced.map((pick) => pick.id),
    });

    for (let round = 0; round < 50; round += 1) {
      const shuffle = <T,>(list: readonly T[]): T[] => {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1));
          [copy[i], copy[j]] = [copy[j]!, copy[i]!];
        }
        return copy;
      };
      const shuffled: Case = {
        ...c,
        picks: shuffle(c.picks),
        fixedBlocks: shuffle(c.fixedBlocks),
        anchors: shuffle(c.anchors),
      };
      const result = proposeLayout(shuffled);
      expect(
        JSON.stringify({ blocks: result.blocks, unplaced: result.unplaced.map((pick) => pick.id) }),
      ).toBe(baselineKey);
    }
  });
});
