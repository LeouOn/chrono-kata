'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { PROVIDER_DEFAULTS, PROVIDER_NAMES } from '@/lib/llm/provider-defaults';

const KEY = ['llmSettings'] as const;

export function useLLMSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => llmSettingsRepo.get(),
  });

  const addProvider = useMutation({
    mutationFn: ({ name, apiKey, model, baseUrl }: { name: string; apiKey: string; model: string; baseUrl: string }) =>
      llmSettingsRepo.addProvider(name, { apiKey, model, baseUrl }),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const removeProvider = useMutation({
    mutationFn: (name: string) => llmSettingsRepo.removeProvider(name),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const setActive = useMutation({
    mutationFn: (name: string) => llmSettingsRepo.setActive(name),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    addProvider: addProvider.mutateAsync,
    removeProvider: removeProvider.mutateAsync,
    setActive: setActive.mutateAsync,
    configuredProviderNames: query.data ? Object.keys(query.data.providers) : [],
    presetNames: PROVIDER_NAMES,
    presetDefaults: PROVIDER_DEFAULTS,
  };
}
