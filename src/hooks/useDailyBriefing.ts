'use client';

import { useState, useEffect, useCallback } from 'react';
import { generateDailyBriefing } from '@/lib/llm/llm-service';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { useSettings } from '@/hooks/useSettings';
import { useStreak } from '@/hooks/useStreak';
import { useSessions } from '@/hooks/useSessions';
import { toLocalDateString } from '@/lib/utils/date';
import { getDayOfWeek } from '@/lib/streak/compute-streak';

interface BriefingData {
  briefing: string;
  providerName: string;
  model: string;
  generatedAt: string;
}

export function useDailyBriefing() {
  const { settings } = useSettings();
  const { streak } = useStreak();
  const { sessions } = useSessions();

  const [data, setData] = useState<BriefingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personality = settings?.selectedCoachPersonality ?? 'zen';
  const today = toLocalDateString(new Date());
  const cacheKey = `chrono-kata-briefing-${today}-${personality}`;

  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached) as BriefingData);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [cacheKey]);

  const generate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const llmSettings = await llmSettingsRepo.get();
      if (Object.keys(llmSettings.providers).length === 0) {
        throw new Error('No LLM provider configured. Add an API key in LLM settings.');
      }

      const isRestDayToday = settings?.restDays?.includes(getDayOfWeek(new Date())) ?? false;

      const result = await generateDailyBriefing({
        streakDays: streak?.currentStreakDays ?? 0,
        recentSessions: sessions.slice(0, 5),
        personality,
        displayName: settings?.displayName,
        isRestDayToday,
        llmSettings,
      });

      const briefingData: BriefingData = {
        briefing: result.briefing,
        providerName: result.providerName,
        model: result.model,
        generatedAt: new Date().toISOString(),
      };

      setData(briefingData);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(briefingData));
      } catch {
        // Ignore cache storage error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [sessions, streak, personality, settings, cacheKey]);

  return {
    briefing: data?.briefing ?? null,
    providerName: data?.providerName ?? null,
    model: data?.model ?? null,
    isLoading,
    error,
    generate,
  };
}
