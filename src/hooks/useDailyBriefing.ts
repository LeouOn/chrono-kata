'use client';

import { useCallback, useEffect, useState } from 'react';
import { generateDailyBriefing } from '@/lib/llm/llm-service';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import { useSettings } from '@/hooks/useSettings';
import { useStreak } from '@/hooks/useStreak';
import { useSessions } from '@/hooks/useSessions';
import { toLocalDateString } from '@/lib/utils/date';
import { getDayOfWeek } from '@/lib/streak/compute-streak';
import { buildPacingContext, hashPacingContext, type PacingContext } from '@/lib/llm/pacing-context';

interface BriefingData {
  briefing: string;
  summary: string;
  suggestion: string;
  usedFallback: boolean;
  providerName: string;
  model: string;
  generatedAt: string;
}

export function usePacingContext(): { context: PacingContext | null; ready: boolean } {
  const { settings } = useSettings();
  const { streak } = useStreak();
  const { sessions } = useSessions();
  const [context, setContext] = useState<PacingContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [checkIns, templates] = await Promise.all([
        checkInRepo.getAll(),
        kataTemplateRepo.getAll(),
      ]);
      if (cancelled) return;
      const today = toLocalDateString(new Date());
      setContext(buildPacingContext({
        today,
        sessions,
        templates,
        checkIns,
        streakDays: streak?.currentStreakDays ?? 0,
        restDay: settings?.restDays?.includes(getDayOfWeek(new Date())) ?? false,
      }));
    })();
    return () => { cancelled = true; };
  }, [sessions, streak, settings]);

  return { context, ready: context != null };
}

export function useDailyBriefing() {
  const { settings } = useSettings();
  const { context } = usePacingContext();
  const [data, setData] = useState<BriefingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personality = settings?.selectedCoachPersonality ?? 'zen';
  const today = toLocalDateString(new Date());
  const contextHash = context ? hashPacingContext(context) : 'pending';
  const cacheKey = `chrono-kata-briefing-${today}-${personality}-${contextHash}`;

  useEffect(() => {
    if (!context) return;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setData(JSON.parse(cached) as BriefingData);
      else setData(null);
    } catch {
      setData(null);
    }
  }, [cacheKey, context]);

  const generate = useCallback(async () => {
    if (!context) return;
    setIsLoading(true);
    setError(null);
    try {
      const llmSettings = await llmSettingsRepo.get();
      if (Object.keys(llmSettings.providers).length === 0) {
        throw new Error('No LLM provider configured. Add an API key in LLM settings.');
      }
      const result = await generateDailyBriefing({
        personality,
        displayName: settings?.displayName,
        pacing: context,
        llmSettings,
      });
      const briefingData: BriefingData = {
        briefing: result.suggestion,
        summary: result.summary,
        suggestion: result.suggestion,
        usedFallback: result.usedFallback,
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
  }, [context, personality, settings, cacheKey]);

  return {
    briefing: data?.briefing ?? null,
    summary: data?.summary ?? null,
    suggestion: data?.suggestion ?? null,
    usedFallback: data?.usedFallback ?? false,
    providerName: data?.providerName ?? null,
    model: data?.model ?? null,
    pacing: context,
    isLoading,
    error,
    generate,
  };
}
