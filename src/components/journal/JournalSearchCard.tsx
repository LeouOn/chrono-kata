'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useJournalList } from '@/hooks/useJournal';
import { normaliseSearchQuery, searchJournalEntries } from '@/lib/journal/search';
import { formatLongDate } from '@/lib/journal/export';

const FIELD_LABELS: Record<string, string> = {
  journal: 'journal',
  shutdown: 'shutdown note',
  firstAction: "tomorrow's first move",
};

/**
 * Search over the journal entries (roadmap Wave 12's "entries are searchable").
 *
 * In memory over the stored day plans: a few thousand rows are small enough that
 * a scan needs no index. Matching and previews come from the same normalised
 * text, so a multi-word query finds an entry across a line break.
 */
export function JournalSearchCard() {
  const [query, setQuery] = useState('');
  const { data: plans = [], isLoading } = useJournalList();
  const needle = normaliseSearchQuery(query);
  const hits = useMemo(
    () => (needle === '' ? [] : searchJournalEntries(plans, query)),
    [plans, query, needle],
  );

  return (
    <section aria-labelledby="search-heading" className="space-y-3">
      <div>
        <h2 id="search-heading" className="font-serif text-lg text-text">
          Search
        </h2>
        <p className="text-xs text-text-muted">Find a word or a phrase across your entries.</p>
      </div>

      <label className="block text-xs text-text-muted" htmlFor="journal-search">
        Search the journal
      </label>
      <input
        id="journal-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
        placeholder="e.g. position sizing"
      />

      <div aria-live="polite" className="space-y-2">
        {isLoading ? <p className="text-sm text-text-muted">Reading your entries…</p> : null}
        {!isLoading && needle !== '' && hits.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing matches that yet.</p>
        ) : null}
        {needle !== '' && hits.length > 0 ? (
          <p className="text-xs text-text-muted">
            {hits.length} {hits.length === 1 ? 'entry' : 'entries'}
          </p>
        ) : null}
        <ul className="space-y-2">
          {hits.map((hit) => (
            <li key={hit.date}>
              <Link
                href={`/journal?date=${hit.date}`}
                className="block min-h-11 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
                aria-label={`Open the entry for ${formatLongDate(hit.date)}`}
              >
                <span className="block text-sm text-text">{formatLongDate(hit.date)}</span>
                <span className="block text-xs text-text-muted">{hit.preview}</span>
                <span className="block text-[11px] text-text-muted">
                  in {hit.fields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
