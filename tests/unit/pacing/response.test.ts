import { describe, expect, it } from 'vitest';
import {
  correlation,
  estimateEnvelope,
  laggedPairs,
  wellbeing,
} from '@/lib/pacing/response';
import { WELLBEING_WEIGHTS } from '@/lib/pacing/types';
import type { CheckIn } from '@/lib/schemas/check-in';

function ci(date: string, energy: 1 | 2 | 3 | 4 | 5, fog: 1 | 2 | 3 | 4 | 5 = 2, aches: 1 | 2 | 3 | 4 | 5 = 2, sleep: 1 | 2 | 3 | 4 | 5 = 3): CheckIn {
  return {
    date,
    energy,
    fog,
    aches,
    sleep,
    createdAt: new Date(2026, 8, 25),
    updatedAt: new Date(2026, 8, 25),
  };
}

function assertWellbeingCloseTo(pairs: readonly (readonly [number, number])[], expected: readonly number[]): void {
  expect(pairs).toHaveLength(expected.length);
  expected.forEach((value, i) => {
    expect(pairs[i]?.[1]).toBeCloseTo(value, 12);
  });
}

describe('WELLBEING_WEIGHTS', () => {
  it('sums to 1 and covers all four fields', () => {
    const values = Object.values(WELLBEING_WEIGHTS);
    expect(values).toHaveLength(4);
    expect(values.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 12);
  });
});

describe('wellbeing', () => {
  it.each([
    ['all 3s lands mid-scale', ci('2026-09-25', 3, 3, 3, 3), 0.5],
    ['best possible day', ci('2026-09-25', 5, 1, 1, 5), 1.0],
    ['worst possible day', ci('2026-09-25', 1, 5, 5, 1), 0.0],
    ['mixed day', ci('2026-09-25', 4, 2, 3, 3), 0.65],
  ])('%s -> %s', (_name, checkIn, expected) => {
    expect(wellbeing(checkIn)).toBeCloseTo(expected, 12);
  });

  it('stays within 0-1 across the full grid', () => {
    for (let energy = 1; energy <= 5; energy++) {
      for (let fog = 1; fog <= 5; fog++) {
        for (let aches = 1; aches <= 5; aches++) {
          for (let sleep = 1; sleep <= 5; sleep++) {
            const score = wellbeing(ci('2026-09-25', energy as 1, fog as 1, aches as 1, sleep as 1));
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('accepts custom weights', () => {
    const score = wellbeing(ci('2026-09-25', 5, 1, 1, 1), { energy: 1, sleep: 0, fog: 0, aches: 0 });
    expect(score).toBeCloseTo(1, 12);
  });
});

describe('laggedPairs', () => {
  // wellbeing defaults (fog 2, aches 2, sleep 3): e=4 -> 0.7, e=3 -> 0.6, e=2 -> 0.5
  const checkIns = [ci('2026-09-25', 4), ci('2026-09-26', 2), ci('2026-09-29', 3)];
  const daily = new Map<string, number>([
    ['2026-09-24', 30],
    ['2026-09-26', 10],
  ]);

  it('pairs each check-in with the load lag days earlier, treating missing days as 0', () => {
    const lag1 = laggedPairs(daily, checkIns, 1);
    expect(lag1.map(([load]) => load)).toEqual([30, 0, 0]);
    assertWellbeingCloseTo(lag1, [0.7, 0.5, 0.6]);

    const lag2 = laggedPairs(daily, checkIns, 2);
    expect(lag2.map(([load]) => load)).toEqual([0, 30, 0]);
    assertWellbeingCloseTo(lag2, [0.7, 0.5, 0.6]);
  });

  it('skips days without a check-in and returns [] for empty inputs', () => {
    // 2026-09-26 and 09-27 have no check-ins, so no pairs reference their loads.
    expect(laggedPairs(daily, checkIns, 1)).toHaveLength(3);
    expect(laggedPairs(daily, [], 1)).toEqual([]);
    expect(laggedPairs(new Map(), checkIns, 1).map(([load]) => load)).toEqual([0, 0, 0]);
  });
});

describe('correlation', () => {
  it('returns null correlations below n=2', () => {
    expect(correlation([])).toEqual({ n: 0, spearman: null, pearson: null });
    expect(correlation([[1, 0.5]])).toEqual({ n: 1, spearman: null, pearson: null });
  });

  it('returns Spearman 1 for perfect monotonic (even non-linear) data', () => {
    const pairs = [
      [0, 0],
      [1, 1],
      [2, 4],
      [3, 9],
    ] as const;
    const result = correlation(pairs);
    expect(result.n).toBe(4);
    expect(result.spearman).toBeCloseTo(1, 12);
    // Hand-computed Pearson for y = x^2 over x = 0..3: 15 / sqrt(245).
    expect(result.pearson).toBeCloseTo(15 / Math.sqrt(245), 12);
  });

  it('returns -1 for a perfectly decreasing linear relationship', () => {
    const pairs = [
      [0, 0.5],
      [10, 0.4],
      [20, 0.3],
      [30, 0.2],
      [40, 0.1],
    ] as const;
    const result = correlation(pairs);
    expect(result.spearman).toBeCloseTo(-1, 12);
    expect(result.pearson).toBeCloseTo(-1, 10);
  });

  it('average-ranks ties before Spearman', () => {
    const pairs = [
      [1, 0.2],
      [1, 0.4],
      [2, 0.6],
    ] as const;
    const result = correlation(pairs);
    // Hand-computed: both coefficients reduce to sqrt(3)/2 with these ranks.
    expect(result.spearman).toBeCloseTo(Math.sqrt(3) / 2, 10);
    expect(result.pearson).toBeCloseTo(Math.sqrt(3) / 2, 10);
  });

  it('returns nulls when either variable is constant', () => {
    const result = correlation([
      [1, 0.5],
      [2, 0.5],
      [3, 0.5],
    ] as const);
    expect(result).toEqual({ n: 3, spearman: null, pearson: null });
  });
});

describe('estimateEnvelope', () => {
  it('reports insufficient data below 14 pairs', () => {
    const pairs = Array.from({ length: 13 }, (_, i) => [i, 0.5] as const);
    expect(estimateEnvelope(pairs)).toEqual({ insufficientData: true });
  });

  it('finds the largest threshold whose above-bucket drops >= 0.1 with >= 3 observations', () => {
    const pairs = [
      ...Array.from({ length: 5 }, () => [0, 0.8] as const),
      ...Array.from({ length: 5 }, () => [10, 0.8] as const),
      ...Array.from({ length: 2 }, () => [20, 0.5] as const),
      ...Array.from({ length: 3 }, () => [30, 0.5] as const),
    ];
    expect(estimateEnvelope(pairs)).toEqual({ envelope: 20, n: 15, confidence: 'low' });
  });

  it('ignores candidate thresholds with fewer than 3 observations above them', () => {
    const pairs = [
      ...Array.from({ length: 6 }, () => [0, 0.8] as const),
      ...Array.from({ length: 6 }, () => [10, 0.8] as const),
      ...Array.from({ length: 2 }, () => [20, 0.3] as const),
    ];
    // Only t=0 qualifies (the t=10 above-bucket has 2 pairs), so the envelope is 0.
    expect(estimateEnvelope(pairs)).toEqual({ envelope: 0, n: 14, confidence: 'low' });
  });

  it('upgrades confidence to medium at n >= 30', () => {
    const pairs = [
      ...Array.from({ length: 10 }, () => [0, 0.8] as const),
      ...Array.from({ length: 10 }, () => [10, 0.8] as const),
      ...Array.from({ length: 4 }, () => [20, 0.5] as const),
      ...Array.from({ length: 6 }, () => [30, 0.5] as const),
    ];
    expect(estimateEnvelope(pairs)).toEqual({ envelope: 20, n: 30, confidence: 'medium' });
  });

  it('falls back to the max observed load when wellbeing never drops', () => {
    const pairs = Array.from({ length: 16 }, (_, i) => [i, 0.8] as const);
    expect(estimateEnvelope(pairs)).toEqual({ envelope: 15, n: 16, confidence: 'low' });
  });

  it('handles all-zero load with an envelope of 0', () => {
    const pairs = Array.from({ length: 15 }, () => [0, 0.6] as const);
    expect(estimateEnvelope(pairs)).toEqual({ envelope: 0, n: 15, confidence: 'low' });
  });
});
