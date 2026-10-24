import { afterEach, describe, expect, it } from 'vitest';
import {
  MIN_GAP_MIN,
  moveBlock,
  proposeLayout,
  replanFromNow,
  resizeBlock,
  type Interval,
  type PickForLayout,
} from '@/lib/planning/layout';
import { localWallClockToEpoch } from '@/lib/planning/time';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}

const MIN = 60_000;
const DAY = '2026-06-15';
const DOMAIN_A = '44444444-4444-4444-8444-444444444444';

function windowOf(day = DAY, start = '09:00', end = '17:00') {
  return { start: localWallClockToEpoch(day, start), end: localWallClockToEpoch(day, end) };
}

function pick(id: string, partial: Partial<PickForLayout> = {}): PickForLayout {
  return {
    id,
    estimateMin: 30,
    energy: 'med',
    domainId: null,
    createdAt: new Date(2026, 5, 1, 9, 0, Number(id.slice(-1)) || 0),
    ...partial,
  };
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
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

describe('replanFromNow', () => {
  it('keeps started blocks and re-lays a pick whose block is still in the future', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const now = localWallClockToEpoch(DAY, '12:00');
      const started: Interval = { start: localWallClockToEpoch(DAY, '09:00'), end: localWallClockToEpoch(DAY, '10:00') };
      const future: Interval = { start: localWallClockToEpoch(DAY, '15:00'), end: localWallClockToEpoch(DAY, '16:00') };

      const result = replanFromNow({
        picks: [pick('p1', { createdAt: new Date(2026, 5, 1, 9, 0) }), pick('p2', { createdAt: new Date(2026, 5, 1, 9, 1) })],
        existingFocusBlocks: [
          { ...started, taskId: 'p1' },
          { ...future, taskId: 'p2' },
        ],
        window,
        fixedBlocks: [],
        anchors: [],
        now,
        stepMin: 15,
      });

      expect(result.kept.map((block) => block.taskId)).toEqual(['p1']);
      expect(result.relaid.map((block) => block.taskId)).toEqual(['p2']);
      expect(result.overflow).toEqual([]);
      // The relaid block is in the remaining time, after now.
      expect(result.relaid[0]!.start).toBeGreaterThanOrEqual(now);
    });
  });

  it('reports overflow when the remaining day has no room', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const now = localWallClockToEpoch(DAY, '16:45');
      const result = replanFromNow({
        picks: [pick('p1'), pick('p2')],
        existingFocusBlocks: [],
        window,
        fixedBlocks: [],
        anchors: [],
        now,
        stepMin: 15,
      });
      expect(result.relaid).toEqual([]);
      expect(result.overflow).toHaveLength(2);
    });
  });

  it('places every pick exactly once across kept, relaid and overflow, and keeps the gap after a kept block', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const now = localWallClockToEpoch(DAY, '11:00');
      const keptBlock = { start: localWallClockToEpoch(DAY, '09:00'), end: localWallClockToEpoch(DAY, '10:00'), taskId: 'p1' };
      const result = replanFromNow({
        picks: [pick('p1', { createdAt: new Date(2026, 5, 1, 9, 0) }), pick('p2', { createdAt: new Date(2026, 5, 1, 9, 1) }), pick('p3', { createdAt: new Date(2026, 5, 1, 9, 2) })],
        existingFocusBlocks: [keptBlock],
        window,
        fixedBlocks: [],
        anchors: [],
        now,
        stepMin: 15,
      });

      const ids = [
        ...result.kept.map((block) => block.taskId),
        ...result.relaid.map((block) => block.taskId),
        ...result.overflow.map((entry) => entry.id),
      ];
      expect(new Set(ids).size).toBe(3);
      for (const block of result.relaid) {
        expect(block.start - keptBlock.end).toBeGreaterThanOrEqual(MIN_GAP_MIN * MIN);
      }
    });
  });

  it('is identical over shuffled input, including a finished day', () => {
    inZone('UTC', () => {
      const random = randomFactory(7);
      const window = windowOf();
      const now = localWallClockToEpoch(DAY, '12:00');
      const picks = [pick('p1'), pick('p2'), pick('p3'), pick('p4'), pick('p5')];
      const base = replanFromNow({
        picks,
        existingFocusBlocks: [{ start: localWallClockToEpoch(DAY, '09:00'), end: localWallClockToEpoch(DAY, '10:00'), taskId: 'p1' }],
        window,
        fixedBlocks: [],
        anchors: [],
        now,
        stepMin: 15,
      });
      const key = JSON.stringify({
        kept: base.kept.map((block) => block.taskId),
        relaid: base.relaid,
        overflow: base.overflow.map((entry) => entry.id),
      });
      for (let round = 0; round < 50; round += 1) {
        const result = replanFromNow({
          picks: shuffle(picks, random),
          existingFocusBlocks: [{ start: localWallClockToEpoch(DAY, '09:00'), end: localWallClockToEpoch(DAY, '10:00'), taskId: 'p1' }],
          window,
          fixedBlocks: [],
          anchors: [],
          now,
          stepMin: 15,
        });
        expect(
          JSON.stringify({
            kept: result.kept.map((block) => block.taskId),
            relaid: result.relaid,
            overflow: result.overflow.map((entry) => entry.id),
          }),
        ).toBe(key);
      }

      const over = replanFromNow({
        picks: shuffle(picks, random),
        existingFocusBlocks: [],
        window,
        fixedBlocks: [],
        anchors: [],
        now: window.end + 60 * MIN,
        stepMin: 15,
      });
      expect(over.overflow.map((entry) => entry.id)).toEqual(
        replanFromNow({
          picks,
          existingFocusBlocks: [],
          window,
          fixedBlocks: [],
          anchors: [],
          now: window.end + 60 * MIN,
          stepMin: 15,
        }).overflow.map((entry) => entry.id),
      );
    });
  });

  it('works across DST nights in the zones the roadmap names', () => {
    const cases: [string, string][] = [
      ['America/Los_Angeles', '2026-03-08'],
      ['America/Los_Angeles', '2026-11-01'],
      ['Europe/Helsinki', '2026-03-29'],
      ['Europe/Helsinki', '2026-10-25'],
      ['Pacific/Auckland', '2026-04-05'],
      ['Pacific/Auckland', '2026-09-27'],
    ];
    for (const [zone, day] of cases) {
      inZone(zone, () => {
        const window = windowOf(day, '00:00', '06:00');
        const result = proposeLayout({
          picks: [pick('p1', { estimateMin: 60 })],
          window,
          fixedBlocks: [],
          anchors: [{ start: localWallClockToEpoch(day, '01:00'), end: localWallClockToEpoch(day, '02:00'), domainId: DOMAIN_A }],
          now: window.start,
          stepMin: 15,
        });
        expect(result.blocks).toHaveLength(1);
        expect((result.blocks[0]!.end - result.blocks[0]!.start) / MIN).toBe(60);
      });
    }
  });
});

describe('move snap is symmetric and the grid survives off-grid windows', () => {
  it('moves by the nearest step in both directions', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const block = { start: localWallClockToEpoch(DAY, '10:00'), end: localWallClockToEpoch(DAY, '10:30') };
      // Nearest-step rule: up to 7 minutes either way stays put (ties at 7.5
      // round up, documented by snapToStep's nearest mode).
      for (let delta = 1; delta <= 7; delta += 1) {
        expect(moveBlock(block, delta * MIN, window, 15).start).toBe(block.start);
        expect(moveBlock(block, -delta * MIN, window, 15).start).toBe(block.start);
      }
      for (let delta = 8; delta <= 14; delta += 1) {
        expect(moveBlock(block, delta * MIN, window, 15).start).toBe(block.start + 15 * MIN);
        expect(moveBlock(block, -delta * MIN, window, 15).start).toBe(block.start - 15 * MIN);
      }
      expect(moveBlock(block, 8 * MIN, window, 15).start).toBe(block.start + 15 * MIN);
      expect(moveBlock(block, -8 * MIN, window, 15).start).toBe(block.start - 15 * MIN);
    });
  });

  it('clamps to grid points for off-grid windows', () => {
    inZone('UTC', () => {
      const window = { start: localWallClockToEpoch(DAY, '07:07'), end: localWallClockToEpoch(DAY, '21:53') };
      const block = { start: localWallClockToEpoch(DAY, '10:00'), end: localWallClockToEpoch(DAY, '10:30') };
      const left = moveBlock(block, -600 * MIN, window, 15);
      expect(left.start).toBe(localWallClockToEpoch(DAY, '07:15'));
      const right = moveBlock(block, 1000 * MIN, window, 15);
      expect(right.end).toBe(localWallClockToEpoch(DAY, '21:45'));

      const resizedStart = resizeBlock(block, 'start', window.start, window, 15);
      expect(resizedStart.start).toBe(localWallClockToEpoch(DAY, '07:15'));
      const resizedEnd = resizeBlock(block, 'end', window.end, window, 15);
      expect(resizedEnd.end).toBe(localWallClockToEpoch(DAY, '21:45'));

      for (const interval of [left, right, resizedStart, resizedEnd]) {
        expect((interval.start - localWallClockToEpoch(DAY, '07:15')) % (15 * MIN)).toBe(0);
        expect((interval.end - localWallClockToEpoch(DAY, '07:15')) % (15 * MIN)).toBe(0);
        expect(interval.start).toBeGreaterThanOrEqual(window.start);
        expect(interval.end).toBeLessThanOrEqual(window.end);
      }
    });
  });

  it('is deterministic for a finished day regardless of input order', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const picks = [pick('p3'), pick('p1'), pick('p2')];
      const sorted = proposeLayout({ picks, window, fixedBlocks: [], anchors: [], now: window.end + MIN });
      expect(sorted.unplaced.map((entry) => entry.id)).toEqual(
        proposeLayout({ picks: [...picks].reverse(), window, fixedBlocks: [], anchors: [], now: window.end + MIN }).unplaced.map(
          (entry) => entry.id,
        ),
      );
    });
  });
});
