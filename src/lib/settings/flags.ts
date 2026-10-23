/**
 * Feature-flag accessors.
 *
 * The flags themselves live on the singleton settings row (see
 * `src/lib/schemas/settings.ts`). These helpers are the only way to read or
 * change them, so a flag is always read with an explicit default and a typo
 * in a flag name cannot compile.
 */
import { FLAG_NAMES, type FlagName, type FlagValues } from '@/lib/schemas/settings';

/** A flag that was never set reads as off unless the caller says otherwise. */
export const DEFAULT_FLAG_VALUE = false;

/**
 * Read one flag. `fallback` applies when the flag is unset — including when
 * the whole settings row predates flags and has no `flags` object at all.
 */
export function flagValue(
  flags: FlagValues | null | undefined,
  flag: FlagName,
  fallback: boolean = DEFAULT_FLAG_VALUE,
): boolean {
  const value = flags?.[flag];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Return a new flag set with one flag set, keeping every other flag as it is.
 * Never mutates the input.
 */
export function withFlag(
  flags: FlagValues | null | undefined,
  flag: FlagName,
  value: boolean,
): FlagValues {
  return { ...(flags ?? {}), [flag]: value };
}

/** Narrow an arbitrary string to a known flag name. */
export function isFlagName(value: string): value is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(value);
}
