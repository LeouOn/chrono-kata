/**
 * Independent layout oracle (adopted from dev-lead's review of PR #40, credited
 * in docs/waves/wave-07.md).
 *
 * Random cases in seven zones (including DST-change days) checked for the
 * properties that matter, not examples: every pick lands exactly once, blocks
 * are inside the window on the grid with the exact rounded duration, nothing
 * overlaps a fixed block or a foreign-domain anchor, the gap holds, no pick is
 * left unplaced while a fitting grid slot exists, and replan partitions every
 * pick across kept/relaid/overflow.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MIN_GAP_MIN, proposeLayout, replanFromNow, type PickForLayout } from '@/lib/planning/layout';
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

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

interface Case {
  window: { start: number; end: number };
  fixedBlocks: { start: number; end: number }[];
  anchors: { start: number; end: number; domainId: string | null }[];
  picks: PickForLayout[];
  now: number;
  stepMin: number;
}

function makeCase(random: () => number, day: string): Case {
  const pickOf = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const startClock = pickOf(['07:07', '09:00', '10:00', '13:00', '20:00']);
  const overnight = startClock === '20:00';
  const endClock = overnight ? '02:00' : pickOf(['15:00', '17:00', '21:53']);
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
  const picks = Array.from({ length: Math.floor(random() * 7) }, (_, index) => ({
    id: `${index % 2 === 0 ? '11111111' : '22222222'}-1111-4111-8111-${String(index).padStart(12, '0')}`,
    estimateMin: 5 + Math.floor(random() * 90),
    energy: pickOf(['low', 'med', 'high'] as const),
    domainId: pickOf([null, DOMAIN_A, DOMAIN_B]),
    createdAt: new Date(2026, 0, 1, 9, 0, index),
  }));
  const nowChoice = pickOf(['before', 'inside', 'after'] as const);
  const now =
    nowChoice === 'before'
      ? window.start - 60 * MIN
      : nowChoice === 'after'
        ? window.end + 60 * MIN
        : window.start + Math.floor(random() * (span / (10 * MIN))) * 10 * MIN;
  return { window, fixedBlocks, anchors, picks, now, stepMin };
}

function union(list: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else out.push({ ...interval });
  }
  return out;
}

function freeFor(c: Case, domainId: string | null | undefined, placed: { start: number; end: number }[]) {
  const blocked = union([
    ...c.fixedBlocks,
    ...c.anchors.filter((anchor) => !anchor.domainId || anchor.domainId !== (domainId ?? null)),
    ...placed.map((block) => ({ start: block.start - 5 * MIN, end: block.end + 5 * MIN })),
  ]);
  const out: { start: number; end: number }[] = [];
  let cursor = c.window.start;
  for (const interval of blocked) {
    if (interval.end <= cursor) continue;
    if (interval.start >= c.window.end) break;
    if (interval.start > cursor) out.push({ start: cursor, end: Math.min(interval.start, c.window.end) });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < c.window.end) out.push({ start: cursor, end: c.window.end });
  return out;
}

describe('layout oracle', () => {
  for (const zone of ZONES) {
    it(`holds in ${zone} (60 random cases)`, () => {
      process.env.TZ = zone;
      const random = randomFactory(0x1a2b3c4d);
      const days = ['2026-06-15', ...(DST_DAYS[zone] ?? [])];
      for (let i = 0; i < 60; i += 1) {
        const day = days[i % days.length]!;
        const c = makeCase(random, day);
        const result = proposeLayout(c);
        const startBound = Math.max(c.now, c.window.start);
        const grid = c.stepMin * MIN;

        const placedIds = result.blocks.map((block) => block.taskId);
        const unplacedIds = result.unplaced.map((pick) => pick.id);
        const all = [...placedIds, ...unplacedIds];
        expect(new Set(all).size).toBe(all.length);
        expect(new Set(all)).toEqual(new Set(c.picks.map((pick) => pick.id)));

        for (const block of result.blocks) {
          expect(block.start).toBeGreaterThanOrEqual(startBound);
          expect(block.end).toBeLessThanOrEqual(c.window.end);
          expect(block.start % grid).toBe(0);
          expect(block.end % grid).toBe(0);
          const pick = c.picks.find((entry) => entry.id === block.taskId)!;
          const estimate = pick.estimateMin ?? 25;
          expect(block.end - block.start).toBe(Math.max(grid, Math.ceil((estimate * MIN) / grid) * grid));
          for (const fixed of c.fixedBlocks) {
            expect(block.start >= fixed.end || block.end <= fixed.start).toBe(true);
          }
          for (const anchor of c.anchors) {
            if (!anchor.domainId || anchor.domainId === (pick.domainId ?? null)) continue;
            expect(block.start >= anchor.end || block.end <= anchor.start).toBe(true);
          }
        }

        const sorted = [...result.blocks].sort((a, b) => a.start - b.start);
        for (let index = 1; index < sorted.length; index += 1) {
          expect(sorted[index]!.start - sorted[index - 1]!.end).toBeGreaterThanOrEqual(MIN_GAP_MIN * MIN);
        }

        // Completeness: an unplaced pick must not still have a fitting slot.
        for (const skipped of result.unplaced) {
          const estimate = skipped.estimateMin ?? 25;
          const duration = Math.max(grid, Math.ceil((estimate * MIN) / grid) * grid);
          const free = freeFor(c, skipped.domainId, result.blocks);
          const fits = free.some((interval) => {
            const raw = Math.max(interval.start, startBound);
            const snapped = Math.ceil(raw / grid) * grid;
            return snapped + duration <= interval.end;
          });
          expect(fits).toBe(false);
        }

        // Replan partition.
        const replan = replanFromNow({
          ...c,
          existingFocusBlocks: result.blocks.slice(0, 1).map((block) => ({ ...block, taskId: block.taskId })),
        });
        const replanAll = [
          ...replan.kept.map((block) => block.taskId),
          ...replan.relaid.map((block) => block.taskId),
          ...replan.overflow.map((pick) => pick.id),
        ];
        expect(new Set(replanAll)).toEqual(new Set(c.picks.map((pick) => pick.id)));
        expect(new Set(replanAll).size).toBe(replanAll.length);
      }
    });
  }
});
