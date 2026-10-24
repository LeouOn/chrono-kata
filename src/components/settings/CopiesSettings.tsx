'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useFlag } from '@/hooks/useFlags';
import {
  KEEP_CHOICES,
  deleteCopy,
  getKeep,
  lastCopyAt,
  lastCopyProblem,
  listCopies,
  makeCopy,
  pruneCopies,
  readCopyText,
  setKeep,
  type CopyInfo,
} from '@/lib/copies/copies';
import { HONEST_LIMIT, copyLabel, copySummary, lastCopyLine, reasonLabel, sizeLabel } from '@/lib/copies/text';
import { parseEnvelope } from '@/lib/data-transfer/import';
import { refusalMessage } from '@/lib/data-transfer/preview';
import { useQueryClient } from '@tanstack/react-query';
import { ImportPreview, type ParsedBackup } from './ImportPreview';

/**
 * Automatic copies on this device (roadmap Wave 18 part 4, behind `taskInbox`): the list, "make one now",
 * how many to keep, and restore from any. Restoring opens the SAME preview as importing a file (add what
 * is missing, or replace), with the copy as its source; nothing is applied without it.
 */
export function CopiesSettings() {
  const enabled = useFlag('taskInbox');
  const qc = useQueryClient();
  const keepId = useId();
  const [copies, setCopies] = useState<CopyInfo[] | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [keep, setKeepState] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ backup: ParsedBackup; label: string } | null>(null);
  const [deleting, setDeleting] = useState<CopyInfo | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    const [list, newest] = await Promise.all([listCopies(), lastCopyAt()]);
    setCopies(list);
    setLast(newest);
    setProblem(lastCopyProblem());
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setKeepState(getKeep());
    void refresh();
  }, [enabled, refresh]);

  if (!enabled) return null;

  async function makeNow() {
    setBusy(true);
    setMessage(null);
    const made = await makeCopy('manual');
    setBusy(false);
    if (!made.ok) setMessage(`${made.message} Nothing was changed.`);
    else setMessage('Made a copy of everything on this device.');
    await refresh();
  }

  async function review(copy: CopyInfo) {
    setMessage(null);
    const text = await readCopyText(copy.id);
    if (text === null) {
      setMessage("That copy can't be read any more, so it can't be restored. You can delete it.");
      return;
    }
    const parsed = parseEnvelope(text);
    if (!parsed.ok) {
      setMessage(refusalMessage(parsed.error));
      return;
    }
    setReviewing({ backup: parsed, label: copyLabel(copy.madeAt, new Date()) });
  }

  async function confirmDelete() {
    if (!deleting) return;
    await deleteCopy(deleting.id);
    setDeleting(null);
    await refresh();
  }

  async function changeKeep(value: number) {
    if (!setKeep(value)) return;
    setKeepState(value);
    await pruneCopies(value);
    await refresh();
    setMessage(`Keeping the last ${value} copies.`);
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">Copies on this device</div>
      <p className="text-sm text-text" data-testid="last-copy">
        {copies === null ? 'Looking for copies…' : lastCopyLine(last, now)}
      </p>
      <p className="mt-2 text-sm text-text-muted">{HONEST_LIMIT}</p>
      {problem && (
        <p role="status" className="mt-2 text-sm text-text" data-testid="copies-problem">
          The last automatic copy could not be made: {problem}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-text" data-testid="copies-message">
          {message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void makeNow()}>
          Make a copy now
        </Button>
        <label htmlFor={keepId} className="flex min-h-11 items-center gap-2 text-sm text-text">
          Keep the last
          <select
            id={keepId}
            className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm text-text"
            value={keep}
            onChange={(event) => void changeKeep(Number(event.target.value))}
          >
            {KEEP_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          copies
        </label>
      </div>

      {copies !== null && copies.length > 0 && (
        <ul className="mt-3 space-y-3" aria-label="Copies, newest first">
          {copies.map((copy) => {
            const label = copyLabel(copy.madeAt, now);
            return (
              <li key={copy.id} className="rounded-2xl border border-border p-3" data-testid="copy-item">
                <p className="text-sm text-text">{label}</p>
                <p className="text-xs text-text-muted">
                  {reasonLabel(copy.reason)} · {copySummary(copy.counts)} · {sizeLabel(copy.bytes)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="ghost" className="min-h-11" onClick={() => void review(copy)} aria-label={`Look at the copy from ${label}`}>
                    Look at this copy…
                  </Button>
                  <Button variant="ghost" className="min-h-11" onClick={() => setDeleting(copy)} aria-label={`Delete the copy from ${label}`}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reviewing && (
        <ImportPreview
          backup={reviewing.backup}
          onCancel={() => setReviewing(null)}
          onDone={(text) => {
            setReviewing(null);
            setMessage(`${text} (from the copy of ${reviewing.label})`);
            qc.invalidateQueries();
            void refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this copy?"
        message={deleting ? `The copy from ${copyLabel(deleting.madeAt, now)} will be removed from this device. Your data is not touched.` : ''}
        confirmLabel="Delete copy"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
