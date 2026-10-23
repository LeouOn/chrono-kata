'use client';

import { useCallback } from 'react';
import { settingsRepo, type SettingsRepository } from '@/lib/db/settings.repo';
import { useSettings } from '@/hooks/useSettings';
import type { LLMFeature, LLMRouting } from '@/lib/schemas/settings';

/**
 * Per-feature provider routing (roadmap W5).
 *
 * The table lives on the settings row, so it reuses the settings query. A
 * feature with no entry follows the routing default, which itself falls back
 * to the active provider.
 */
export function useLLMRouting(repo: SettingsRepository = settingsRepo) {
  const { settings, updateSettings } = useSettings(repo);
  const routing = settings?.llmRouting;

  const setRouting = useCallback(
    async (next: LLMRouting | undefined) => updateSettings({ llmRouting: next }),
    [updateSettings],
  );

  const setDefaultProvider = useCallback(
    async (providerName: string | undefined) => {
      const current = routing ?? {};
      const next: LLMRouting = { ...current };
      if (providerName) next.default = providerName;
      else delete next.default;
      return updateSettings({ llmRouting: next });
    },
    [routing, updateSettings],
  );

  const setFeatureProvider = useCallback(
    async (feature: LLMFeature, providerName: string | undefined) => {
      const current = routing ?? {};
      const features = { ...(current.features ?? {}) };
      if (providerName) features[feature] = providerName;
      else delete features[feature];
      return updateSettings({ llmRouting: { ...current, features } });
    },
    [routing, updateSettings],
  );

  return { routing, setRouting, setDefaultProvider, setFeatureProvider };
}
