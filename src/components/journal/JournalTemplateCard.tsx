'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/hooks/useSettings';
import {
  DEFAULT_JOURNAL_TEMPLATE,
  JOURNAL_TEMPLATE_MAX,
  importJournalTemplate,
  resolveJournalTemplate,
} from '@/lib/journal/template';
import { normaliseMultiline } from '@/lib/journal/template';

/**
 * The journal template: the markdown scaffold a new entry starts from.
 *
 * It is the person's own text, stored on the settings row. Saving goes through
 * `updateSettingsWith`, so the write is merged against the stored row inside the
 * transaction (a template save can never revert a setting somebody else just
 * changed).
 */
export function JournalTemplateCard() {
  const { settings, updateSettingsWith } = useSettings();
  const saved = settings?.journalTemplate;
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const value = text ?? resolveJournalTemplate(saved);

  async function save(next: string, message: string) {
    if (guardRef.current) return;
    guardRef.current = true;
    setError(null);
    setStatus(null);
    try {
      const normalised = normaliseMultiline(next);
      await updateSettingsWith(() => ({ journalTemplate: normalised }));
      setStatus(message);
      setText(null);
    } catch {
      setError('The template was not saved, so it is unchanged. Try again.');
    } finally {
      guardRef.current = false;
    }
  }

  async function importFile(file: File) {
    setError(null);
    setStatus(null);
    try {
      const result = importJournalTemplate(await file.text());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText(result.value);
      setStatus('Imported. Save the template to keep it, or keep editing.');
    } catch {
      setError('That file could not be read.');
    }
  }

  return (
    <section aria-labelledby="template-heading" className="space-y-3">
      <div>
        <h2 id="template-heading" className="font-serif text-lg text-text">
          Template
        </h2>
        <p className="text-xs text-text-muted">
          A new entry starts from this. <code className="text-text">{'{{date}}'}</code>,{' '}
          <code className="text-text">{'{{weekday}}'}</code> and <code className="text-text">{'{{domains}}'}</code>{' '}
          are filled in for the day; anything else stays as you wrote it.
        </p>
      </div>

      <label className="block text-xs text-text-muted" htmlFor="journal-template">
        Journal template (markdown)
      </label>
      <textarea
        id="journal-template"
        value={value}
        maxLength={JOURNAL_TEMPLATE_MAX}
        rows={8}
        onChange={(event) => setText(event.target.value.slice(0, JOURNAL_TEMPLATE_MAX))}
        className="w-full rounded-xl border border-border bg-surface px-3 py-3 font-mono text-xs text-text"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-11" onClick={() => void save(value, 'Template saved on this device.')}>
          Save template
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={() => fileRef.current?.click()}>
          Import markdown file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          className="sr-only"
          aria-label="Import a markdown template file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setText(DEFAULT_JOURNAL_TEMPLATE);
            setStatus('The default template is in the box; save it to use it.');
          }}
        >
          Use the default
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
