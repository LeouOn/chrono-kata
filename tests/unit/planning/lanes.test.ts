import { describe, expect, it } from 'vitest';
import { assignLanes } from '@/lib/planning/layout';

const block = (id: string, startHour: number, endHour: number) => ({
  id,
  start: Date.UTC(2026, 5, 15, startHour),
  end: Date.UTC(2026, 5, 15, endHour),
});

describe('assignLanes', () => {
  it('gives non-overlapping blocks one lane', () => {
    const result = assignLanes([block('a', 9, 10), block('b', 10, 11)]);
    expect(result.map((entry) => [entry.id, entry.lane, entry.laneCount])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('puts two overlapping blocks side by side', () => {
    const result = assignLanes([block('a', 9, 11), block('b', 10, 12)]);
    expect(result.map((entry) => [entry.id, entry.lane, entry.laneCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  it('reuses a lane once it is free', () => {
    const result = assignLanes([block('a', 9, 10), block('b', 9.5, 11), block('c', 10, 12)]);
    expect(result.map((entry) => [entry.id, entry.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
    expect(result.every((entry) => entry.laneCount === 2)).toBe(true);
  });

  it('handles three simultaneous blocks', () => {
    const result = assignLanes([block('a', 9, 12), block('b', 9.5, 11), block('c', 10, 10.5)]);
    expect(new Set(result.map((entry) => entry.lane))).toEqual(new Set([0, 1, 2]));
    expect(result.every((entry) => entry.laneCount === 3)).toBe(true);
  });

  it('does not depend on input order', () => {
    const input = [block('a', 9, 11), block('b', 10, 12), block('c', 10.5, 11.5), block('d', 13, 14)];
    const forward = assignLanes(input);
    const backward = assignLanes([...input].reverse());
    const byId = (rows: typeof forward) =>
      [...rows].sort((x, y) => x.id.localeCompare(y.id)).map((row) => [row.id, row.lane, row.laneCount]);
    expect(byId(backward)).toEqual(byId(forward));
  });

  it('keeps touching blocks in one lane and one cluster (gap-free is not overlap)', () => {
    const result = assignLanes([block('a', 9, 10), block('b', 10, 11)]);
    expect(result.every((entry) => entry.lane === 0)).toBe(true);
    expect(result.every((entry) => entry.laneCount === 1)).toBe(true);
  });

  it('does not widen a block that merely ends when a two-block overlap starts', () => {
    const result = assignLanes([block('a', 9, 10), block('b', 10, 11), block('c', 10.5, 11.5)]);
    expect(result.map((entry) => [entry.id, entry.lane, entry.laneCount])).toEqual([
      ['a', 0, 1],
      ['b', 0, 2],
      ['c', 1, 2],
    ]);
  });

  it('breaks ties between identical intervals by id, independent of input order', () => {
    const x = block('a', 9, 10);
    const y = block('b', 9, 10);
    const forward = assignLanes([x, y]);
    const backward = assignLanes([y, x]);
    const byId = (rows: typeof forward) => [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => [row.id, row.lane]);
    expect(byId(backward)).toEqual(byId(forward));
  });
});
