import { describe, expect, it } from 'vitest';
import { layoutPickIds } from '@/lib/planning/layout-picks';

const status = new Map([
  ['t1', 'next'],
  ['t2', 'next'],
  ['t3', 'done'],
]);

describe('layoutPickIds', () => {
  it('uses the confirmed plan, in its order, not the suggestions', () => {
    expect(layoutPickIds({ dayPlanPicks: ['t2'], suggestedIds: ['t1', 't2'], statusById: status })).toEqual(['t2']);
  });

  it('uses suggestions when no plan exists', () => {
    expect(layoutPickIds({ dayPlanPicks: null, suggestedIds: ['t1', 't2'], statusById: status })).toEqual(['t1', 't2']);
  });

  it('drops picks that are no longer open', () => {
    expect(layoutPickIds({ dayPlanPicks: ['t1', 't3'], suggestedIds: [], statusById: status })).toEqual(['t1']);
  });
});
