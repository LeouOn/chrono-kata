import { describe, expect, it } from 'vitest';
import { checkOvercommit, DEFAULT_PICK_MINUTES } from '@/lib/planning/overcommit';

const GUILT = /overdue|late\b|behind|missed|failed|should have|too much/i;

describe('checkOvercommit', () => {
  it('sums explicit estimates', () => {
    const result = checkOvercommit([{ estimateMin: 20 }, { estimateMin: 30 }], 100);
    expect(result).toMatchObject({ totalMin: 50, capacityMin: 100, over: false });
    expect(result.message).toMatch(/inside the 100/);
  });

  it('counts a pick without an estimate at the documented default (25)', () => {
    expect(DEFAULT_PICK_MINUTES).toBe(25);
    const result = checkOvercommit([{}, { estimateMin: 10 }], 100);
    expect(result.totalMin).toBe(35);
  });

  it('treats exactly filling the day as not over', () => {
    const result = checkOvercommit([{ estimateMin: 100 }], 100);
    expect(result.over).toBe(false);
  });

  it('reports how much does not fit, gently', () => {
    const result = checkOvercommit([{ estimateMin: 60 }, { estimateMin: 60 }], 100);
    expect(result).toMatchObject({ totalMin: 120, capacityMin: 100, over: true });
    expect(result.message).toMatch(/20 more than the 100/);
    expect(result.message).toMatch(/Something can wait/);
    expect(result.message).not.toMatch(GUILT);
  });

  it('handles a zero-capacity day without blame', () => {
    const result = checkOvercommit([{ estimateMin: 25 }], 0);
    expect(result.over).toBe(true);
    expect(result.message).toMatch(/no room left/);
    expect(result.message).not.toMatch(GUILT);
  });

  it('accepts an empty pick list', () => {
    const result = checkOvercommit([], 100);
    expect(result).toMatchObject({ totalMin: 0, over: false });
  });

  it('lets the caller override the default estimate', () => {
    const result = checkOvercommit([{}], 100, 40);
    expect(result.totalMin).toBe(40);
  });
});
