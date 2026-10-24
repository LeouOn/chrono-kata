'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { makeCopy } from '@/lib/copies/copies';
import { COLLECTIONS, countOf, joinWords } from '@/lib/data-transfer/collections';
import { replaceAll } from '@/lib/data-transfer/import';
import { applyMerge, planMerge, type MergeReport } from '@/lib/data-transfer/merge';
import {
  deviceCounts,
  leftOutLine,
  mergeResultSentence,
  mergeSecretsLine,
  mergeSentence,
  previewRows,
  repairedLine,
  replaceResultSentence,
  replaceSecretsLine,
  replaceSentence,
  singletonsReplaced,
  skippedLine,
  type DeviceCounts,
} from '@/lib/data-transfer/preview';
import type { BackupSecrets } from '@/lib/data-transfer/encrypted';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

export interface ParsedBackup {
  envelope: ExportEnvelope;
  skipped: number;
  snapshotsDropped: number;
  repaired: number;
  repairedBy: Record<string, number>;
  /** From an encrypted file whose box was ticked: restored by a replace, never by an add. */
  secrets?: BackupSecrets | null;
}

interface Props {
  backup: ParsedBackup;
  /** Called with what happened, once the import has been applied. */
  onDone: (message: string) => void;
  onCancel: () => void;
}

type Mode = 'merge' | 'replace';

/**
 * What an import will do, before it does it (roadmap Wave 18 part 2, behind `taskInbox`).
 *
 * Two ways in, said in full sentences with the actual numbers: ADD what is missing (the default: it
 * cannot take anything away) or REPLACE everything on this device with the file, which asks once more.
 * Both are one transaction, so a failure leaves the device exactly as it was.
 */
export function ImportPreview({ backup, onDone, onCancel }: Props) {
  const { envelope } = backup;
  const headingId = useId();
  const groupName = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<Mode>('merge');
  const [device, setDevice] = useState<DeviceCounts | null>(null);
  const [plan, setPlan] = useState<MergeReport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Set when the safety copy that comes first could not be made: nothing is imported until the person says so.
  const [noSafetyCopy, setNoSafetyCopy] = useState<{ why: string; mode: Mode } | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([deviceCounts(), planMerge(envelope)]).then(([counts, report]) => {
      if (!live) return;
      setDevice(counts);
      setPlan(report);
    });
    return () => {
      live = false;
    };
  }, [envelope]);

  const rows = device ? previewRows(envelope, device) : null;
  const inFile = joinWords(
    COLLECTIONS.flatMap((c) => {
      const carried = envelope[c.key] as unknown[] | undefined;
      return carried && carried.length > 0 ? [countOf(carried.length, c)] : [];
    }),
  );
  const notes = [skippedLine(backup.skipped), repairedLine(backup.repairedBy), leftOutLine(envelope.leftOut)].filter(Boolean);
  if (backup.snapshotsDropped > 0) {
    notes.push(
      `${backup.snapshotsDropped} weekly review${backup.snapshotsDropped === 1 ? '' : 's'} had a summary this version cannot read; the notes are kept and only the summary is left out.`,
    );
  }

  async function run(chosen: Mode, options: { withoutSafetyCopy?: boolean } = {}) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setNoSafetyCopy(null);
    try {
      // A copy of what is here goes first, so a bad import can be undone from the list of copies. If it
      // cannot be made, nothing is imported until the person chooses to go on without it.
      if (!options.withoutSafetyCopy) {
        const made = await makeCopy('before-import');
        if (!made.ok) {
          setNoSafetyCopy({ why: made.message, mode: chosen });
          return;
        }
      }
      if (chosen === 'merge') {
        const report = await applyMerge(envelope);
        onDone(mergeResultSentence(report));
      } else {
        const after = rows ?? [];
        await replaceAll(envelope, { secrets: backup.secrets ?? null });
        onDone(replaceResultSentence(after));
      }
    } catch (e) {
      setProblem(`The import could not be finished, so nothing on this device was changed. (${e instanceof Error ? e.message : 'unknown reason'})`);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const swapped = singletonsReplaced(envelope);

  return (
    <section aria-labelledby={headingId} className="mt-4 space-y-3 rounded-2xl border border-border p-3" data-testid="import-preview">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-base font-medium text-text outline-none">
        This backup
      </h3>
      <p className="text-sm text-text">
        {inFile ? `It holds ${inFile}.` : 'It holds no sessions, tasks or other records.'}
      </p>
      {notes.map((note) => (
        <p key={note} className="text-sm text-text-muted">
          {note}
        </p>
      ))}

      <fieldset className="space-y-3">
        <legend className="text-sm text-text">How should it be brought in?</legend>
        <div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-text">
            <input type="radio" name={groupName} className="size-5" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            Add what is missing
          </label>
          <p className="ml-8 text-sm text-text-muted">{plan ? `${mergeSentence(plan)}${mergeSecretsLine(backup.secrets)}` : 'Looking at what is on this device…'}</p>
        </div>
        <div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-text">
            <input type="radio" name={groupName} className="size-5" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            Replace everything on this device
          </label>
          <p className="ml-8 text-sm text-text-muted">
            {rows ? replaceSentence(rows) : 'Looking at what is on this device…'}
            {swapped.length > 0 ? ` Your ${joinWords(swapped)} are replaced by the file's.` : ''} {replaceSecretsLine(backup.secrets)}
          </p>
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className="text-sm text-text">
          {problem}
        </p>
      )}
      {noSafetyCopy && (
        <div role="alert" className="space-y-2 text-sm text-text">
          <p>
            A copy of what is on this device could not be made first ({noSafetyCopy.why}), so nothing was imported. You can go on without that
            copy.
          </p>
          <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void run(noSafetyCopy.mode, { withoutSafetyCopy: true })}>
            Import without a safety copy
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {mode === 'merge' ? (
          <Button className="min-h-11" disabled={busy || !plan} onClick={() => void run('merge')}>
            Add what is missing
          </Button>
        ) : (
          <Button className="min-h-11" disabled={busy || !rows} onClick={() => setConfirming(true)}>
            Replace everything…
          </Button>
        )}
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
          Not now
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Replace everything on this device?"
        message={`${rows ? replaceSentence(rows) : ''} It can't be undone.`}
        confirmLabel="Replace everything"
        onConfirm={() => void run('replace')}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
