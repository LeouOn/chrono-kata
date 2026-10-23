'use client';

import { useCallback } from 'react';
import { settingsRepo, type SettingsRepository } from '@/lib/db/settings.repo';
import { useSettings } from '@/hooks/useSettings';
import { flagValue, withFlag } from '@/lib/settings/flags';
import type { FlagName } from '@/lib/schemas/settings';

/**
 * Read and write feature flags.
 *
 * Flags live on the singleton settings row, so this reuses the settings query
 * instead of adding another one.
 */
export function useFlags(repo: SettingsRepository = settingsRepo) {
  const { settings, updateSettings } = useSettings(repo);
  const flags = settings?.flags;

  const isEnabled = useCallback(
    (flag: FlagName, fallback = false) => flagValue(flags, flag, fallback),
    [flags],
  );

  const setFlag = useCallback(
    async (flag: FlagName, value: boolean) => {
      // Read the stored row first so toggling one flag never drops the others,
      // even when the settings query has not resolved yet.
      const current = await repo.get();
      return updateSettings({ flags: withFlag(current.flags, flag, value) });
    },
    [repo, updateSettings],
  );

  return { flags, isEnabled, setFlag };
}

/** Read one feature flag with an explicit default. */
export function useFlag(flag: FlagName, fallback = false): boolean {
  const { settings } = useSettings();
  return flagValue(settings?.flags, flag, fallback);
}
