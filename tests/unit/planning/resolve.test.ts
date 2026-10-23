import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WAKING_HOURS,
  resolveAnchors,
  resolveWakingHours,
  usesDefaultWakingHours,
} from '@/lib/planning/resolve';
import type { Settings } from '@/lib/schemas/settings';

const base = { id: 'singleton', selectedCoachPersonality: 'zen', unlockedPersonalities: ['zen'], googleCalendarSyncEnabled: false, createdAt: new Date(), updatedAt: new Date() } as unknown as Settings;

const ANCHOR = {
  id: '77777777-7777-4777-8777-777777777777',
  title: 'Trading',
  weekdays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '11:00',
};

describe('resolveWakingHours', () => {
  it('applies the documented default when the row or the field is missing', () => {
    expect(resolveWakingHours(null)).toEqual(DEFAULT_WAKING_HOURS);
    expect(resolveWakingHours(undefined)).toEqual(DEFAULT_WAKING_HOURS);
    expect(resolveWakingHours(base)).toEqual({ start: '07:00', end: '22:00' });
    expect(DEFAULT_WAKING_HOURS).toEqual({ start: '07:00', end: '22:00' });
  });

  it('keeps a stored window, including an overnight one', () => {
    const settings = { ...base, wakingHours: { start: '22:00', end: '07:00' } };
    expect(resolveWakingHours(settings)).toEqual({ start: '22:00', end: '07:00' });
    expect(usesDefaultWakingHours(settings)).toBe(false);
  });

  it('falls back to the default when stored values are invalid', () => {
    const settings = { ...base, wakingHours: { start: '25:00', end: '07:00' } };
    expect(resolveWakingHours(settings)).toEqual(DEFAULT_WAKING_HOURS);
  });
});

describe('resolveAnchors', () => {
  it('returns an empty list when the row or field is missing', () => {
    expect(resolveAnchors(null)).toEqual([]);
    expect(resolveAnchors(base)).toEqual([]);
  });

  it('keeps valid anchors and drops invalid rows instead of crashing', () => {
    const settings = {
      ...base,
      anchors: [ANCHOR, { ...ANCHOR, id: 'not-a-uuid' }, { ...ANCHOR, start: '9:00' }],
    };
    const resolved = resolveAnchors(settings);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.title).toBe('Trading');
  });

  it('keeps a midnight-crossing anchor as stored', () => {
    const settings = { ...base, anchors: [{ ...ANCHOR, start: '22:00', end: '02:00' }] };
    expect(resolveAnchors(settings)[0]).toMatchObject({ start: '22:00', end: '02:00' });
  });
});
