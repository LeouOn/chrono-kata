'use client';

import { useEffect, useState } from 'react';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { resolveProviderFor } from '@/lib/llm/llm-service';
import { isLocalProvider, isLoopbackBaseUrl } from '@/lib/llm/local-provider';
import { LLMException } from '@/lib/llm/types';
import type { LLMFeature } from '@/lib/schemas/settings';

/**
 * Which provider a call would use, resolved WITHOUT sending anything.
 *
 * This is the disclosure half of every AI surface: it names the destination,
 * the model, and whether the request stays on the device, on the local network,
 * or goes to a remote provider — and it reports private mode's refusal before
 * the user presses send. It also resolves through the same routing
 * (`resolveProviderFor`) the call itself uses, so the panel cannot name a
 * different provider than the one that will be called.
 */
export type ProviderPreview =
  | { state: 'ready'; providerName: string; model: string; local: boolean; loopback: boolean }
  | { state: 'blocked' | 'unavailable'; message: string };

export function useProviderPreview(active: boolean, feature: LLMFeature): ProviderPreview {
  const [preview, setPreview] = useState<ProviderPreview>({
    state: 'unavailable',
    message: 'Checking the provider…',
  });

  useEffect(() => {
    if (!active) {
      // A privacy panel must never show a stale destination from a previous
      // open: reset while hidden, re-resolve on the next open.
      setPreview({ state: 'unavailable', message: 'Checking the provider…' });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const settings = await llmSettingsRepo.get();
        const config = await resolveProviderFor(settings, undefined, feature);
        if (!cancelled) {
          setPreview({
            state: 'ready',
            providerName: config.providerName,
            model: config.model,
            local: isLocalProvider(config),
            loopback: isLoopbackBaseUrl(config.baseUrl),
          });
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof LLMException ? e.message : 'No provider is ready for this yet.';
        setPreview({
          state: e instanceof LLMException && e.kind === 'privacyBlocked' ? 'blocked' : 'unavailable',
          message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, feature]);

  return preview;
}

/** A calm sentence naming where a ready preview's request goes. */
export function previewDestination(preview: ProviderPreview): string {
  if (preview.state !== 'ready') return preview.message;
  const where = preview.local
    ? preview.loopback
      ? 'on this device'
      : 'on your local network'
    : 'a remote provider';
  return `Goes to ${preview.providerName} (${preview.model}) — ${where}.`;
}
