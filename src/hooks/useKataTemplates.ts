'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import type { KataTemplate, KataTemplateInput } from '@/lib/schemas/kata-template';

const QUERY_KEY = ['kata-templates'] as const;

export function useKataTemplates() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error } = useQuery<KataTemplate[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      return kataTemplateRepo.getAll();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: KataTemplateInput) => {
      return kataTemplateRepo.create(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<KataTemplateInput> }) => {
      return kataTemplateRepo.update(id, patch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return kataTemplateRepo.delete(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      return kataTemplateRepo.reorder(orderedIds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    templates,
    isLoading,
    error,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    reorderTemplates: reorderMutation.mutateAsync,
  };
}
