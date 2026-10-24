'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import type { WeeklyStats } from '@/lib/review/stats';
import { formatDuration } from '@/lib/utils/format';

/**
 * Step 5 of the review: how the week's estimates compared with the time that
 * actually went in. Read-only and calm — an estimate is a guess to refine, not
 * a score, and work without an estimate is not counted against anything.
 */
export function EstimateStep({ estimate }: { estimate: WeeklyStats['estimateVsActual'] }) {
  if (estimate.tasks === 0) {
    return (
      <Card>
        <p className="font-serif text-lg text-text">No timed task work this week.</p>
        <p className="mt-1 text-sm text-text-muted">
          Nothing to compare yet. Practice sessions still count in the week&apos;s totals.
        </p>
      </Card>
    );
  }

  const over = estimate.deltaMin > 0;
  const same = Math.abs(estimate.deltaMin) < 1;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs text-text-muted">Estimated</p>
          <p className="font-serif text-xl text-text">{formatDuration(estimate.estimatedMin)}</p>
        </Card>
        <Card>
          <p className="text-xs text-text-muted">Actually spent</p>
          <p className="font-serif text-xl text-text">{formatDuration(estimate.actualMin)}</p>
        </Card>
      </div>
      <Card>
        <p className="text-sm text-text">
          {same
            ? 'Close to the estimates.'
            : `${formatDuration(Math.abs(estimate.deltaMin))} ${over ? 'more' : 'less'} than estimated.`}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Across {estimate.tasks} task{estimate.tasks === 1 ? '' : 's'} with timed work this week.
          {estimate.tasksWithoutEstimate > 0
            ? ` ${estimate.tasksWithoutEstimate} had no estimate, so ${estimate.tasksWithoutEstimate === 1 ? 'it counts' : 'they count'} in the time but not the aim.`
            : ''}
        </p>
      </Card>
      <p className="text-xs text-text-muted">
        Estimates are guesses you can refine; a week that ran long is information, not a verdict.
      </p>
    </div>
  );
}
