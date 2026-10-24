'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { previewDestination, useProviderPreview } from '@/hooks/useProviderPreview';
import { useReviewSummary } from '@/hooks/useReviewSummary';
import { summaryToNotes } from '@/lib/review/summary';
import { NOTES_MAX } from '@/lib/review/limits';
import type { Session } from '@/lib/schemas/session';

interface Props {
  /** The reviewed week's sessions; the summary is built from these. */
  sessions: readonly Session[];
  /** The review's notes so far, so the summary can be added without losing them. */
  notes: string;
  /** Called only when the user presses "Add to my notes". */
  onNotesChange: (notes: string) => void;
}

/**
 * The optional AI summary of a weekly review (roadmap Wave 11).
 *
 * It reuses the existing weekly reflection through `useReviewSummary`, and it
 * follows the same disclosure contract as the decomposition sheet: before send,
 * the panel names the destination and shows the exact text that would leave the
 * device (session notes are removed before this point). Nothing is saved or
 * applied without a second, explicit press — the review is complete and useful
 * with this whole section unused.
 */
export function ReviewSummary({ sessions, notes, onNotesChange }: Props) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<{ notes: string; trimmed: boolean } | null>(null);
  const { state, prepare, confirm, close } = useReviewSummary();
  const preview = useProviderPreview(open, 'weeklyReflection');

  function openPanel() {
    setAdded(null);
    prepare(sessions);
    setOpen(true);
  }

  function closePanel() {
    close();
    setOpen(false);
  }

  const busy = state.phase === 'running';
  const canSend = preview.state === 'ready' && sessions.length > 0 && !busy;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base text-text">Optional: a summary of the week</p>
          <p className="mt-1 text-xs text-text-muted">
            What moved, what stalled, one question to sit with. The review is complete without it.
          </p>
        </div>
        {open ? (
          <Button variant="ghost" className="min-h-11 shrink-0" onClick={closePanel}>
            Close
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-11 shrink-0" onClick={openPanel}>
            Get a summary
          </Button>
        )}
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-text-muted">No sessions this week, so there is nothing to summarise.</p>
          ) : null}

          {(state.phase === 'privacy' || state.phase === 'error') && sessions.length > 0 ? (
            <>
              <p className="text-sm text-text">
                This sends this week&apos;s sessions to a language model and nothing else. Session notes are left out
                — only the date, activity, length and rating of each session travel.
              </p>
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="mb-1 text-xs text-text-muted">Exactly what leaves the device:</p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-text">
                  {state.request.userText}
                </pre>
              </div>
              <p className="text-sm text-text">{previewDestination(preview)}</p>
              {preview.state === 'blocked' ? (
                <p className="text-xs text-text-muted">
                  Private mode is on, so only a provider on this device or your local network can be used.
                </p>
              ) : null}
              {state.phase === 'error' ? (
                <p role="alert" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
                  The summary could not be generated, so nothing was added. You can try again or leave it.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => void confirm()} disabled={!canSend}>
                  {busy ? 'Summarising…' : `Send to ${preview.state === 'ready' ? preview.providerName : 'provider'}`}
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={closePanel} disabled={busy}>
                  Not now
                </Button>
              </div>
            </>
          ) : null}

          {state.phase === 'running' ? (
            <p role="status" className="text-sm text-text-muted">
              Asking for the summary…
            </p>
          ) : null}

          {state.phase === 'done' ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">What moved and what stalled</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-text">
                  {state.summary.observations.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </div>
              {state.summary.question.trim() !== '' ? (
                <p className="text-sm text-text">
                  <span className="text-text-muted">Question to sit with: </span>
                  {state.summary.question}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => {
                    const merged = summaryToNotes(notes, state.summary, NOTES_MAX);
                    setAdded(merged);
                    onNotesChange(merged.notes);
                  }}
                >
                  Add to my notes
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={closePanel}>
                  Leave it
                </Button>
              </div>
              {added ? (
                <p role="status" className="text-xs text-text-muted">
                  {added.trimmed
                    ? 'Added, trimmed to fit your notes. The summary is regenerable; your own words were kept.'
                    : 'Added below your notes. Nothing else was saved.'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
