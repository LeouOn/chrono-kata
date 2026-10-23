'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { useFlags } from '@/hooks/useFlags';

/**
 * Settings toggle for the task inbox preview (roadmap Wave 2).
 * Off by default: with the flag off nothing new appears anywhere in the app.
 */
export function TaskInboxSettings() {
  const { isEnabled, setFlag } = useFlags();
  const enabled = isEnabled('taskInbox');

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-text">Tasks and inbox (preview)</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Capture a thought, then sort it later. Off by default.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Tasks and inbox (preview)"
          onClick={() => void setFlag('taskInbox', !enabled)}
          className={`relative inline-flex h-11 w-[52px] shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-surface-2 border border-border'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-base shadow transition-transform ${
              enabled ? 'translate-x-[24px]' : 'translate-x-[6px]'
            }`}
            aria-hidden
          />
        </button>
      </div>
      {enabled ? (
        <p className="text-xs text-text-muted">
          The Inbox link is now in the Home header. Captured items are stored only on this device.
        </p>
      ) : null}
    </Card>
  );
}
