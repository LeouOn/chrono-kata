import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/pacing/days';

describe('addDays', () => {
  it.each([
    ['2026-09-25', 0, '2026-09-25'],
    ['2026-09-25', 1, '2026-09-26'],
    ['2026-09-25', -1, '2026-09-24'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2023-02-28', 1, '2023-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-01-01', -365, '2025-01-01'],
  ])('addDays(%s, %i) -> %s', (start, delta, expected) => {
    expect(addDays(start, delta)).toBe(expected);
  });

  it('rejects malformed day keys', () => {
    expect(() => addDays('2026-9-5', 1)).toThrow(/day key/);
  });
});
