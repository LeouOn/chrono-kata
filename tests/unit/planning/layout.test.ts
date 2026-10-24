import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STEP_MIN,
  MIN_GAP_MIN,
  detectConflicts,
  moveBlock,
  proposeLayout,
  resizeBlock,
  snapToStep,
  unionIntervals,
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

function windowOf(day = DAY, start = '09:00', end = '17:00') {
  return {
    start: localWallClockToEpoch(day, start),
    end: localWallClockToEpoch(day, end),
  };
}

function pick(partial: Partial<PickForLayout> = {}): PickForLayout {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    estimateMin: 30,
    energy: 'med',
    domainId: null,
    createdAt: new Date(2026, 5, 1, 9, 0),
    ...partial,
  };
}

describe('snapToStep', () => {
  it('snaps nearest, up and down to the step', () => {
    const t = 10 * 60 * MIN + 7 * MIN;
    expect(snapToStep(t, 15, 'down')).toBe(10 * 60 * MIN);
    expect(snapToStep(t, 15, 'up')).toBe(10 * 60 * MIN + 15 * MIN);
    expect(snapToStep(10 * 60 * MIN + 8 * MIN, 15, 'nearest')).toBe(10 * 60 * MIN + 15 * MIN);
  });
});

describe('moveBlock and resizeBlock', () => {
  const window = { start: 9 * 60 * MIN, end: 17 * 60 * MIN };

  it('moves, snaps and keeps the duration', () => {
    const block = { start: 10 * 60 * MIN, end: 11 * 60 * MIN };
    const moved = moveBlock(block, 32 * MIN, window, 15);
    expect(moved.start).toBe(10 * 60 * MIN + 30 * MIN);
    expect(moved.end - moved.start).toBe(60 * MIN);
  });

  it('clamps a move to the window', () => {
    const block = { start: 10 * 60 * MIN, end: 11 * 60 * MIN };
    expect(moveBlock(block, -600 * MIN, window, 15).start).toBe(window.start);
    const right = moveBlock(block, 600 * MIN, window, 15);
    expect(right.end).toBe(window.end);
  });

  it('resizes with a one-step minimum and window clamp', () => {
    const block = { start: 10 * 60 * MIN, end: 11 * 60 * MIN };
    expect(resizeBlock(block, 'end', 10 * 60 * MIN + 5 * MIN, window, 15).end).toBe(
      10 * 60 * MIN + 15 * MIN,
    );
    expect(resizeBlock(block, 'start', 11 * 60 * MIN + 30 * MIN, window, 15).start).toBe(
      11 * 60 * MIN - 15 * MIN,
    );
    expect(resizeBlock(block, 'end', 18 * 60 * MIN, window, 15).end).toBe(window.end);
  });
});

describe('unionIntervals', () => {
  it('merges overlaps and adjacency', () => {
    expect(unionIntervals([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });
});

describe('proposeLayout', () => {
  it('places picks inside the window, on step boundaries, with a gap', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const result = proposeLayout({
        picks: [
          pick({ id: '11111111-1111-4111-8111-111111111111', estimateMin: 40 }),
          pick({ id: '22222222-2222-4222-8222-222222222222', estimateMin: 25, createdAt: new Date(2026, 5, 1, 9, 1) }),
        ],
        window,
        fixedBlocks: [],
        anchors: [],
        now: window.start,
        stepMin: 15,
      });

      expect(result.unplaced).toEqual([]);
      expect(result.blocks).toHaveLength(2);
      for (const block of result.blocks) {
        expect(block.start % (15 * MIN)).toBe(0);
        expect(block.start).toBeGreaterThanOrEqual(window.start);
        expect(block.end).toBeLessThanOrEqual(window.end);
      }
      // 40 -> rounded up to 45; 25 -> 30.
      expect(result.blocks[0]!.end - result.blocks[0]!.start).toBe(45 * MIN);
      expect(result.blocks[1]!.end - result.blocks[1]!.start).toBe(30 * MIN);
      expect(result.blocks[1]!.start - result.blocks[0]!.end).toBeGreaterThanOrEqual(MIN_GAP_MIN * MIN);
    });
  });

  it('never overlaps fixed blocks or anchors from another domain', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const fixed = [{ start: localWallClockToEpoch(DAY, '10:00'), end: localWallClockToEpoch(DAY, '11:00') }];
      const anchors = [
        {
          start: localWallClockToEpoch(DAY, '09:00'),
          end: localWallClockToEpoch(DAY, '10:00'),
          domainId: '44444444-4444-4444-8444-444444444444',
        },
      ];
      const result = proposeLayout({
        picks: [pick({ id: '11111111-1111-4111-8111-111111111111', estimateMin: 60 })],
        window,
        fixedBlocks: fixed,
        anchors,
        now: window.start,
        stepMin: 15,
      });
      expect(result.blocks).toHaveLength(1);
      const block = result.blocks[0]!;
      for (const occupied of [...fixed, ...anchors]) {
        expect(block.start >= occupied.end || block.end <= occupied.start).toBe(true);
      }
    });
  });

  it('lets a pick use its own domain anchor window', () => {
    inZone('UTC', () => {
      const window = windowOf(DAY, '09:00', '11:00');
      const domainId = '44444444-4444-4444-8444-444444444444';
      const anchors = [
        {
          start: localWallClockToEpoch(DAY, '09:00'),
          end: localWallClockToEpoch(DAY, '11:00'),
          domainId,
        },
      ];
      const result = proposeLayout({
        picks: [pick({ id: '11111111-1111-4111-8111-111111111111', estimateMin: 60, domainId })],
        window,
        fixedBlocks: [],
        anchors,
        now: window.start,
        stepMin: 15,
      });
      expect(result.blocks).toHaveLength(1);
    });
  });

  it('honours the energy constant: high before noon, low after, when there is room', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const noon = localWallClockToEpoch(DAY, '12:00');
      const result = proposeLayout({
        picks: [
          pick({ id: '11111111-1111-4111-8111-111111111111', estimateMin: 30, energy: 'high' }),
          pick({ id: '22222222-2222-4222-8222-222222222222', estimateMin: 30, energy: 'low', createdAt: new Date(2026, 5, 1, 9, 1) }),
        ],
        window,
        fixedBlocks: [],
        anchors: [],
        now: window.start,
        stepMin: 15,
      });
      const high = result.blocks.find((block) => block.taskId.startsWith('11111111'))!;
      const low = result.blocks.find((block) => block.taskId.startsWith('22222222'))!;
      expect(high.end).toBeLessThanOrEqual(noon);
      expect(low.start).toBeGreaterThanOrEqual(noon);
    });
  });

  it('does not start a block before now', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const now = localWallClockToEpoch(DAY, '13:07');
      const result = proposeLayout({
        picks: [pick({ id: '11111111-1111-4111-8111-111111111111', estimateMin: 30 })],
        window,
        fixedBlocks: [],
        anchors: [],
        now,
        stepMin: 15,
      });
      expect(result.blocks[0]!.start).toBe(localWallClockToEpoch(DAY, '13:15'));
    });
  });

  it('returns everything as unplaced when the day is over', () => {
    inZone('UTC', () => {
      const window = windowOf(DAY, '09:00', '10:00');
      const result = proposeLayout({
        picks: [pick()],
        window,
        fixedBlocks: [],
        anchors: [],
        now: localWallClockToEpoch(DAY, '12:00'),
      });
      expect(result.blocks).toEqual([]);
      expect(result.unplaced).toHaveLength(1);
    });
  });

  it('rounds the estimate UP to the step', () => {
    inZone('UTC', () => {
      const window = windowOf();
      const result = proposeLayout({
        picks: [pick({ estimateMin: 31 })],
        window,
        fixedBlocks: [],
        anchors: [],
        now: window.start,
        stepMin: 15,
      });
      expect(result.blocks[0]!.end - result.blocks[0]!.start).toBe(45 * MIN);
    });
  });

  it('keeps real elapsed minutes on a DST-change day', () => {
    inZone('America/Los_Angeles', () => {
      // Spring forward: 2026-03-08 02:00 -> 03:00. A block from 01:30 to 02:30
      // wall time is 60 real minutes; the layout works in instants.
      const window = windowOf('2026-03-08', '00:00', '06:00');
      const result = proposeLayout({
        picks: [pick({ estimateMin: 60 })],
        window,
        fixedBlocks: [],
        anchors: [],
        now: window.start,
        stepMin: 15,
      });
      expect((result.blocks[0]!.end - result.blocks[0]!.start) / MIN).toBe(60);
    });
  });
});

describe('detectConflicts', () => {
  const window = { start: 9 * 60 * MIN, end: 17 * 60 * MIN };

  it('reports overlapping pairs with neutral wording', () => {
    const conflicts = detectConflicts(
      [
        { start: 10 * 60 * MIN, end: 11 * 60 * MIN },
        { start: 10 * 60 * MIN + 30 * MIN, end: 11 * 60 * MIN + 30 * MIN },
      ],
      window,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe('overlap');
    expect(conflicts[0]!.description).not.toMatch(/overdue|late|behind|missed|should have/i);
  });

  it('reports a block outside the window', () => {
    const conflicts = detectConflicts([{ start: 8 * 60 * MIN, end: 9 * 60 * MIN }], window);
    expect(conflicts.some((conflict) => conflict.kind === 'out-of-window')).toBe(true);
  });
});

describe('layout defaults', () => {
  it('documents the defaults', () => {
    expect(DEFAULT_STEP_MIN).toBe(15);
    expect(MIN_GAP_MIN).toBe(5);
  });
});
