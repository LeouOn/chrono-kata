'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { useLLMRouting } from '@/hooks/useLLMRouting';
import { useSettings } from '@/hooks/useSettings';
import { usePacingContext } from '@/hooks/useDailyBriefing';
import { buildDailyBriefingUserText } from '@/lib/llm/pacing-context';
import { flagValue } from '@/lib/settings/flags';

export function WhatGetsSent() {
  const { settings: llmSettings } = useLLMSettings();
  const { settings } = useSettings();
  const { routing } = useLLMRouting();
  const { context: pacing } = usePacingContext();
  const [open, setOpen] = useState(false);
  if (!pacing) return null;

  const privateMode = flagValue(settings?.flags, 'privateMode');
  const briefingProvider =
    routing?.features?.dailyBriefing ?? routing?.default ?? llmSettings?.activeProviderName ?? 'none';

  return (
    <Card>
      <button
        type="button"
        className="w-full text-left text-sm text-text min-h-11"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide what gets sent' : 'What gets sent'}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-text-muted">Active provider: {llmSettings?.activeProviderName || 'none'}</p>
          <p className="text-xs text-text-muted">
            Daily briefing goes to: {briefingProvider}
            {privateMode ? ' (private mode: only local providers may be used)' : ''}
          </p>
          <pre className="whitespace-pre-wrap text-xs text-text bg-surface-2 rounded-xl p-3 overflow-x-auto">
            {buildDailyBriefingUserText(pacing)}
          </pre>
        </div>
      )}
    </Card>
  );
}
