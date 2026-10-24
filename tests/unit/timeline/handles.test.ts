import { describe, expect, it } from 'vitest';
import { BLOCK_MIN_PX, handleGeometry, laneNeighbours } from '@/lib/timeline/handles';

const H = 3_600_000;
const at = (h: number) => h * H;

describe('handleGeometry', () => {
  it('keeps a movable middle on a 30-minute block', () => {
    const block = { start: at(10), end: at(10.5) };
    const geometry = handleGeometry(block, { fullWidth: true });
    expect(geometry.blockHeight).toBe(33);
    const middle = geometry.end.top - (geometry.start.top + geometry.start.height);
    expect(middle).toBeGreaterThan(0);
    expect(geometry.start.height).toBeLessThanOrEqual(Math.floor(geometry.blockHeight / 3) + 22);
    expect(geometry.end.height).toBeLessThanOrEqual(Math.floor(geometry.blockHeight / 3) + 22);
  });

  it('never overlaps the next block’s start handle when blocks are 5 minutes apart', () => {
    const a = { start: at(13), end: at(14), lane: 0 };
    const b = { start: at(14) + 5 * 60_000, end: at(15) + 5 * 60_000, lane: 0 };
    const ga = handleGeometry(a, { ...laneNeighbours(a, [a, b]), fullWidth: false });
    const gb = handleGeometry(b, { ...laneNeighbours(b, [a, b]), fullWidth: false });
    const aEndBottom = a.end + (ga.end.top - ga.blockHeight + ga.end.height) * 60_000;
    const bStartTop = b.start + (gb.start.top * 60_000) / 1.1;
    expect(aEndBottom).toBeLessThanOrEqual(bStartTop);
  });

  it('brute-forces a day of adjacent blocks in a lane with no handle overlap', () => {
    const blocks = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      start: at(8) + index * 30 * 60_000,
      end: at(8) + (index + 1) * 30 * 60_000,
      lane: 0,
    }));
    for (let index = 0; index < blocks.length - 1; index += 1) {
      const current = blocks[index]!;
      const next = blocks[index + 1]!;
      const g = handleGeometry(current, { ...laneNeighbours(current, blocks), fullWidth: false });
      const n = handleGeometry(next, { ...laneNeighbours(next, blocks), fullWidth: false });
      const currentTop = 0;
      const currentEndBottom = currentTop + g.end.top + g.end.height;
      const nextTop = (next.start - current.start) / 60_000 * 1.1;
      const nextStartTop = nextTop + n.start.top;
      expect(currentEndBottom).toBeLessThanOrEqual(nextStartTop);
    }
  });
});
