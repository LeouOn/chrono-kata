'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsRepo, type SettingsRepository } from '@/lib/db/settings.repo';
import type { Settings } from '@/lib/schemas/settings';

const KEY = ['settings'] as const;

export function useSettings(repo: SettingsRepository = settingsRepo) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => repo.get(),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<Settings>) => repo.patch(patch),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  /**
   * Patch a value that depends on the current row (a nested object, a list).
   * The merge runs inside the repository's transaction, so it cannot be built
   * from a stale render snapshot.
   */
  const mergeMutation = useMutation({
    mutationFn: (merge: (current: Settings) => Partial<Settings>) => repo.patchWith(merge),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    updateSettings: mutation.mutateAsync,
    updateSettingsWith: mergeMutation.mutateAsync,
  };
}
