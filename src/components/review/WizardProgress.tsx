'use client';

import React from 'react';
import { REVIEW_STEPS } from '@/lib/review/steps';

/**
 * Where the user is in the review (roadmap Wave 11): a text label, a bar with
 * real ARIA values, and the promise that every step can be skipped.
 */
export function WizardProgress({ step }: { step: number }) {
  const total = REVIEW_STEPS.length;
  const current = REVIEW_STEPS[step] ?? REVIEW_STEPS[0]!;
  const label = `Step ${step + 1} of ${total}: ${current.title}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-text-muted">
        <span aria-live="polite">{label}</span>
        <span className="shrink-0">~15–25 min</span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Review progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={label}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Every step is optional. Your progress is saved on this device.
      </p>
    </div>
  );
}
