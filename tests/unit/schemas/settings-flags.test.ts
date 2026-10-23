import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FLAG_NAMES,
  FlagsSchema,
  SettingsSchema,
  type FlagName,
  type FlagValues,
} from '@/lib/schemas/settings';
import { flagValue, isFlagName, withFlag } from '@/lib/settings/flags';

const now = new Date('2026-10-23T12:00:00Z');

describe('feature flags on the settings row', () => {
  it('accepts a settings row written before flags existed', () => {
    const result = SettingsSchema.safeParse({
      id: 'singleton',
      selectedCoachPersonality: 'zen',
      unlockedPersonalities: ['zen'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.flags).toBeUndefined();
  });

  it('accepts a row with only some flags set', () => {
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      flags: { sync: true },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.flags).toEqual({ sync: true });
  });

  it('rejects a non-boolean flag value', () => {
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      flags: { sync: 'yes' },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it('starts new rows with no flags set', () => {
    expect(DEFAULT_SETTINGS.flags).toEqual({});
  });

  it('exposes the closed set of flag names the roadmap needs', () => {
    expect(FLAG_NAMES).toEqual(['privateMode', 'nativeCalendar', 'nudgeKinds', 'sync']);
    expect(
      FlagsSchema.safeParse({
        privateMode: true,
        nativeCalendar: false,
        nudgeKinds: false,
        sync: false,
      }).success,
    ).toBe(true);
  });
});

describe('flag accessors', () => {
  it('falls back when the flag is unset', () => {
    expect(flagValue({}, 'sync')).toBe(false);
    expect(flagValue(undefined, 'sync')).toBe(false);
    expect(flagValue({}, 'sync', true)).toBe(true);
    expect(flagValue(undefined, 'sync', true)).toBe(true);
  });

  it('returns the stored value when the flag is set', () => {
    expect(flagValue({ sync: true }, 'sync')).toBe(true);
    expect(flagValue({ sync: false }, 'sync', true)).toBe(false);
  });

  it('merges one flag without dropping the others', () => {
    expect(withFlag({ sync: true }, 'privateMode', true)).toEqual({
      sync: true,
      privateMode: true,
    });
    expect(withFlag(undefined, 'nudgeKinds', true)).toEqual({ nudgeKinds: true });
  });

  it('recognises known flag names only', () => {
    expect(isFlagName('sync')).toBe(true);
    expect(isFlagName('privteMode')).toBe(false);
  });
});

describe('typos fail the typecheck', () => {
  it('rejects an unknown flag name', () => {
    // @ts-expect-error 'privteMode' is not a FlagName
    const typo: FlagName = 'privteMode';
    expect(typo).toBe('privteMode');
  });

  it('rejects an unknown flag key in a flag object', () => {
    // @ts-expect-error 'privteMode' is not a known flag
    const flags: FlagValues = { privteMode: true };
    expect(flags).toEqual({ privteMode: true });
  });
});
