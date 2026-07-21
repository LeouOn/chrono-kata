'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reflectionRepo } from '@/lib/db/reflection.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { generateWeeklyReflection } from '@/lib/llm/llm-service';
import type { Reflection } from '@/lib/schemas/reflection';

const KEY = ['reflections'] as const;

export function useReflections() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => reflectionRepo.getAll(),
  });

  const generate = useMutation({
    mutationFn: async (): Promise<Reflection> => {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [sessions, appSettings, llmSettings] = await Promise.all([
        sessionRepo.getByPeriod(sevenDaysAgo, now),
        settingsRepo.get(),
        llmSettingsRepo.get(),
      ]);

      if (sessions.length === 0) {
        throw new Error('No sessions in the last 7 days.');
      }
      if (Object.keys(llmSettings.providers).length === 0) {
        throw new Error('Configure an LLM provider first.');
      }

      const result = await generateWeeklyReflection({
        sessions,
        personality: appSettings.selectedCoachPersonality,
        displayName: appSettings.displayName,
        llmSettings,
      });

      const reflection = await reflectionRepo.save({
        periodStart: sevenDaysAgo,
        periodEnd: now,
        observations: result.observations,
        question: result.question,
        sourceSessionIds: sessions.map((s) => s.id),
      });

      await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
      return reflection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    reflections: query.data ?? [],
    isLoading: query.isLoading,
    generate: generate.mutateAsync,
    isGenerating: generate.isPending,
    error: generate.error,
  };
}
