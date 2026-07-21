import { describe, it, expect } from 'vitest';
import { MILESTONES, isNewMilestone } from '@/lib/streak/milestones';

describe('MILESTONES', () => {
  it('returns the fixed list from the spec', () => {
    expect(MILESTONES).toEqual([3, 7, 14, 30, 60, 90, 180, 365]);
  });
});

describe('isNewMilestone', () => {
  it('returns the milestone crossed going from 6 to 7 days', () => {
    expect(isNewMilestone(7, 6)).toBe(7);
  });

  it('returns null when no milestone is crossed', () => {
    expect(isNewMilestone(8, 7)).toBeNull();
  });

  it('returns null when current is below previous', () => {
    expect(isNewMilestone(5, 7)).toBeNull();
  });

  it('caps at 365', () => {
    expect(isNewMilestone(400, 364)).toBe(365);
  });

  it('handles first milestone crossing (3)', () => {
    expect(isNewMilestone(3, 2)).toBe(3);
  });
});
