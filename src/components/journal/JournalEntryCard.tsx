'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useJournalWrites } from '@/hooks/useJournal';
import { renderJournalTemplate, resolveJournalTemplate, JOURNAL_TEXT_MAX } from '@/lib/journal/template';
import { formatLongDate } from '@/lib/journal/export';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Domain } from '@/lib/schemas/domain';

interface Props {
  dayKey: string;
  plan: DayPlan | null;
  domains: Domain[];
  /** The saved template, or undefined for the app default. */
  savedTemplate: string | undefined;
}

/**
 * The day's journal entry: the text, and the domain ticks that go with it.
 *
 * A new entry starts from the person's template (rendered for this day); an
 * existing entry opens as it was written. The save is one row write and its
 * rejection is caught and said out loud, with the guard reset so the button
 * works again.
 */
export function JournalEntryCard({ dayKey, plan, domains, savedTemplate }: Props) {
  const { saveFields } = useJournalWrites();
  const template = resolveJournalTemplate(savedTemplate);
  const rendered = renderJournalTemplate(template, {
    date: dayKey,
    weekday: formatLongDate(dayKey).split(' ')[0] ?? '',
    domains,
  });

  const storedJournal = plan?.journal ?? '';
  const [text, setText] = useState(storedJournal === '' ? rendered : storedJournal);
  const [checks, setChecks] = useState<Record<string, boolean>>(plan?.domainChecks ?? {});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const guardRef = useRef(false);

  // Re-sync when the DAY changes (the screen is not remounted between days),
  // and never on a save of the same day: overwriting the textarea or clearing
  // the "Saved" status while somebody is writing would be worse than stale.
  const lastDay = useRef(dayKey);
  useEffect(() => {
    if (lastDay.current === dayKey) return;
    lastDay.current = dayKey;
    setText(storedJournal === '' ? rendered : storedJournal);
    setChecks(plan?.domainChecks ?? {});
    setStatus(null);
    setError(null);
  }, [dayKey, storedJournal, rendered, plan?.domainChecks]);

  async function save() {
    if (guardRef.current) return;
    guardRef.current = true;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await saveFields.mutateAsync({ date: dayKey, journal: text, domainChecks: checks });
      setStatus('Saved on this device.');
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : 'That entry was not saved, so nothing was changed. Try again.',
      );
    } finally {
      guardRef.current = false;
      setSaving(false);
    }
  }

  const orderedDomains = [...domains].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  return (
    <section aria-labelledby="journal-entry-heading" className="space-y-3">
      <div>
        <h2 id="journal-entry-heading" className="font-serif text-lg text-text">
          Journal
        </h2>
        <p className="text-xs text-text-muted">Your own words for {formatLongDate(dayKey)}. Kept on this device.</p>
      </div>

      <label className="block text-xs text-text-muted" htmlFor="journal-text">
        What happened today
      </label>
      <textarea
        id="journal-text"
        value={text}
        maxLength={JOURNAL_TEXT_MAX}
        rows={10}
        onChange={(event) => setText(event.target.value.slice(0, JOURNAL_TEXT_MAX))}
        className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-text"
      />
      <p className="text-right text-[11px] text-text-muted">
        {text.length} / {JOURNAL_TEXT_MAX}
      </p>

      {orderedDomains.length > 0 ? (
        <fieldset className="space-y-1">
          <legend className="text-xs uppercase tracking-wide text-text-muted">Domains touched today</legend>
          {orderedDomains.map((domain) => (
            <label key={domain.id} className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={checks[domain.id] === true}
                onChange={(event) =>
                  setChecks((current) => ({ ...current, [domain.id]: event.target.checked }))
                }
                className="h-4 w-4 accent-accent"
              />
              {domain.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-11" onClick={() => void save()} disabled={saving} aria-busy={saving}>
          Save journal
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setText(rendered);
            setStatus(null);
          }}
          disabled={text === rendered}
        >
          Start from the template
        </Button>
      </div>
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
