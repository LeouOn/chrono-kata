'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { generateWeeklyReflection } from '@/lib/llm/llm-service';
import {
  buildReviewSummaryRequest,
  type ReviewSummaryRequest,
  type ReviewSummaryText,
} from '@/lib/review/summary';
import type { Session } from '@/lib/schemas/session';

/**
 * The optional AI summary of a review (roadmap Wave 11).
 *
 * Flow: `prepare(sessions)` builds the request (and therefore the exact wire
 * text) → the caller shows the disclosure → `confirm()` sends → the result is
 * shown. `confirm()` is the only path that can reach the network, and it is
 * called by an explicit button.
 *
 * The in-flight guard and the abort controller live in refs (not state), so a
 * double click in one act() cannot start two calls, and closing aborts cleanly.
 * Nothing is written here: merging the summary into the notes is a separate,
 * explicit action in the caller.
 */
export type ReviewSummaryState =
  | { phase: 'idle' }
  | { phase: 'privacy'; request: ReviewSummaryRequest }
  | { phase: 'running'; request: ReviewSummaryRequest }
  | { phase: 'done'; request: ReviewSummaryRequest; summary: ReviewSummaryText }
  | { phase: 'error'; request: ReviewSummaryRequest; error: unknown };

export function useReviewSummary() {
  const [state, setState] = useState<ReviewSummaryState>({ phase: 'idle' });
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Build the request; nothing leaves the device until confirm(). */
  const prepare = useCallback((sessions: readonly Session[]) => {
    setState({ phase: 'privacy', request: buildReviewSummaryRequest(sessions) });
  }, []);

  const confirm = useCallback(async () => {
    if (inFlightRef.current) return;
    const current = state;
    if (current.phase !== 'privacy' && current.phase !== 'error') return;
    const request = current.request;
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: 'running', request });
    try {
      const [appSettings, llmSettings] = await Promise.all([settingsRepo.get(), llmSettingsRepo.get()]);
      const result = await generateWeeklyReflection({
        sessions: request.sessions,
        personality: appSettings.selectedCoachPersonality,
        displayName: appSettings.displayName,
        llmSettings,
        signal: controller.signal,
      });
      await llmSettingsRepo.incrementTokenUsage(result.promptTokens, result.completionTokens);
      if (!mountedRef.current) return;
      setState({
        phase: 'done',
        request,
        summary: { observations: result.observations, question: result.question },
      });
    } catch (error) {
      if (!mountedRef.current) return;
      // Closing aborts in flight: no error UI for a call the user cancelled.
      if (controller.signal.aborted) return;
      setState({ phase: 'error', request, error });
    } finally {
      inFlightRef.current = false;
    }
  }, [state]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setState({ phase: 'idle' });
  }, []);

  return { state, prepare, confirm, close };
}
