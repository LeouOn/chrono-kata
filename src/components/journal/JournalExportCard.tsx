'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { readJournalExportSource, useJournalList } from '@/hooks/useJournal';
import { offerTextFile } from '@/lib/journal/handoff';
import {
  exportDayMarkdown,
  exportMonthMarkdown,
  exportWeekMarkdown,
  formatLongDate,
} from '@/lib/journal/export';
import type { DayPlan } from '@/lib/schemas/day-plan';

interface Props {
  dayKey: string;
  plan: DayPlan | null;
}

type Range = 'day' | 'week' | 'month';

const RANGE_LABELS: Record<Range, string> = {
  day: 'This day',
  week: 'This week',
  month: 'This month',
};

/**
 * The markdown export (roadmap Wave 12): the day, its Monday-based week or its
 * local calendar month, built from the stored rows each time and handed to the
 * person as a file. It contains only what they wrote — no AI text, no derived
 * commentary.
 */
export function JournalExportCard({ dayKey, plan }: Props) {
  const [range, setRange] = useState<Range>('day');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoading: plansLoading } = useJournalList();

  async function exportNow() {
    setError(null);
    setStatus(null);
    try {
      // Fresh read at event time: the caches may be stale between a write and
      // its refetch, and a journal saved a moment ago must be in the file.
      const input = await readJournalExportSource();
      const text =
        range === 'day'
          ? exportDayMarkdown(dayKey, input)
          : range === 'week'
            ? exportWeekMarkdown(dayKey, input)
            : exportMonthMarkdown(dayKey, input);
      const suffix = range === 'day' ? dayKey : range === 'week' ? `week-${dayKey}` : dayKey.slice(0, 7);
      const how = await offerTextFile(`chrono-kata-journal-${range}-${suffix}.md`, text);
      if (how === 'cancelled') {
        // The person closed the share sheet: a decision, not a failure.
        setStatus(null);
        return;
      }
      setStatus(
        how === 'shared'
          ? 'Shared the journal file.'
          : how === 'copied'
            ? 'The journal text is on the clipboard.'
            : 'Journal file downloaded.',
      );
    } catch {
      setError('That export could not be handed over, so nothing was written anywhere.');
    }
  }

  return (
    <section aria-labelledby="export-heading" className="space-y-3">
      <div>
        <h2 id="export-heading" className="font-serif text-lg text-text">
          Export
        </h2>
        <p className="text-xs text-text-muted">
          Markdown, built from what you wrote here. No AI text is ever added. This is a readable copy of your
          journal. It is not a backup.
        </p>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs uppercase tracking-wide text-text-muted">Range</legend>
        {(Object.keys(RANGE_LABELS) as Range[]).map((value) => (
          <Button
            key={value}
            variant={range === value ? 'primary' : 'ghost'}
            className="min-h-11"
            aria-pressed={range === value}
            aria-label={`${RANGE_LABELS[value]}: export ${value}`}
            onClick={() => {
              setRange(value);
              setStatus(null);
            }}
          >
            {RANGE_LABELS[value]}
          </Button>
        ))}
      </fieldset>

      <Button
        className="min-h-11"
        onClick={() => void exportNow()}
        // Never export from a list that has not loaded: the file would say the
        // range is empty while the entries are still arriving.
        disabled={plansLoading || (plan === null && range === 'day')}
      >
        Download markdown
      </Button>
      <p className="text-xs text-text-muted">
        {formatLongDate(dayKey)} · {RANGE_LABELS[range].toLowerCase()}
      </p>

      {status ? (
        <p role="status" className="text-xs text-text-muted">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
