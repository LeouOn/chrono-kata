'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { useLLMRouting } from '@/hooks/useLLMRouting';
import { LLM_FEATURES, type LLMFeature } from '@/lib/schemas/settings';

const FEATURE_LABELS: Record<LLMFeature, string> = {
  dailyBriefing: 'Daily briefing',
  sessionCoachComment: 'Session coach comment',
  weeklyReflection: 'Weekly reflection',
  conversationReply: 'Coach conversation reply',
  labelSuggestion: 'Label suggestion',
  decomposition: 'Task decomposition (roadmap W3)',
  estimate: 'Estimates (roadmap W4)',
};

/**
 * Which provider each AI surface uses.
 *
 * "Follow the default" means the provider that is active overall, unless a
 * routing default is set below.
 */
export function ProviderRouting() {
  const { settings } = useLLMSettings();
  const { routing, setDefaultProvider, setFeatureProvider } = useLLMRouting();
  const providerNames = Object.keys(settings?.providers ?? {});
  if (providerNames.length === 0) return null;

  const defaultName = routing?.default ?? '';
  const featureProvider = (feature: LLMFeature) => routing?.features?.[feature] ?? '';

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Routing</div>
      <p className="text-xs text-text-muted mb-3">
        Send each AI surface to a different provider — for example the coach on a local model while
        the weekly summary uses a cloud model.
      </p>
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-muted">Default</span>
          <select
            value={defaultName}
            onChange={(e) => void setDefaultProvider(e.target.value || undefined)}
            className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-text text-sm"
          >
            <option value="">Active provider ({settings?.activeProviderName || 'none'})</option>
            {providerNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        {LLM_FEATURES.map((feature) => (
          <label key={feature} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-text-muted">{FEATURE_LABELS[feature]}</span>
            <select
              value={featureProvider(feature)}
              onChange={(e) => void setFeatureProvider(feature, e.target.value || undefined)}
              className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-text text-sm"
            >
              <option value="">Follow the default</option>
              {providerNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Card>
  );
}
