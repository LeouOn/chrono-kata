'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { NotebookPen } from 'lucide-react';
import { useLatestDraft } from '@/hooks/useReview';
import { formatWeekLabel, weekKeyFor } from '@/lib/review/week';
import { REVIEW_STEPS } from '@/lib/review/steps';

/**
 * The weekly review's entry point on Home. With a draft in progress it says so
 * and names the step, so resuming is one tap and nothing looks lost.
 */
export function ReviewLink() {
  const { data: draft } = useLatestDraft();
  const currentWeek = useMemo(() => weekKeyFor(new Date()), []);
  const resuming = draft != null;
  const weekOf = resuming ? draft.weekOf : currentWeek;
  const stepLabel = resuming ? `In progress: step ${Math.min(draft.step + 1, REVIEW_STEPS.length)} of ${REVIEW_STEPS.length}.` : null;

  return (
    <Link
      href="/review"
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
      aria-label={resuming ? `Resume your weekly review for the week of ${formatWeekLabel(weekOf)}` : 'Start your weekly review'}
    >
      <NotebookPen size={18} strokeWidth={2} aria-hidden className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-base text-text">
          {resuming ? 'Resume your weekly review' : 'Weekly review'}
        </span>
        <span className="block text-xs text-text-muted">
          {stepLabel ?? 'A 15–25 minute look back: inbox, waiting tasks, projects, balance, estimates, next week.'}
        </span>
      </span>
      <span className="shrink-0 text-xs text-text-muted">week of {formatWeekLabel(weekOf)}</span>
    </Link>
  );
}
