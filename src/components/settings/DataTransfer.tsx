'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { collectAll, downloadExport } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { useQueryClient } from '@tanstack/react-query';
import { useFlag } from '@/hooks/useFlags';
import { refuseIfTooLarge } from '@/lib/data-transfer/guard';
import { leftOutLine, refusalMessage } from '@/lib/data-transfer/preview';
import { decryptBackup, encryptionAvailable, isEncryptedBackup } from '@/lib/data-transfer/encrypted';
import { EncryptedExportForm } from './EncryptedExportForm';
import { ImportPreview, type ParsedBackup } from './ImportPreview';
import { PassphrasePrompt } from './PassphrasePrompt';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

export function DataTransfer() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ sessions: number; reflections: number } | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<ExportEnvelope | null>(null);
  const [pendingSkipped, setPendingSkipped] = useState(0);
  const [pendingSnapshotsDropped, setPendingSnapshotsDropped] = useState(0);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  // Wave 18 part 2 (behind `taskInbox`): a preview with merge or replace instead of the one-line dialog.
  const enhanced = useFlag('taskInbox');
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  // Which file the person chose LAST. Reading a file and opening an encrypted one both take time; whatever
  // finishes after a newer choice was made is stale and must change nothing (it would otherwise put the OLD
  // file's preview on screen, and Replace would restore it).
  const selection = useRef(0);
  const [encryptedText, setEncryptedText] = useState<string | null>(null);
  const [encryptingExport, setEncryptingExport] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: 'refused' | 'done' | 'saved'; text: string } | null>(null);

  useEffect(() => {
    if (!navigator.storage?.persisted) return;
    void navigator.storage.persisted().then(setStoragePersistent);
  }, []);

  async function handleExport() {
    try {
      const envelope = await collectAll();
      downloadExport(envelope);
      toast.show(`Exported ${envelope.sessions.length} sessions`, 'success');
      if (enhanced) {
        const left = leftOutLine(envelope.leftOut);
        setOutcome({ kind: 'saved', text: `Saved ${envelope.sessions.length} session${envelope.sessions.length === 1 ? '' : 's'} and the rest of your data.${left ? ` ${left}` : ''}` });
      }
    } catch (e) {
      toast.show(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (enhanced) {
      handleEnhancedFile(file);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseEnvelope(String(reader.result));
      if (!result.ok) {
        toast.show(`Import failed: ${result.error}`, 'error');
        return;
      }
      setPendingEnvelope(result.envelope);
      setPendingSkipped(result.skipped);
      setPendingSnapshotsDropped(result.snapshotsDropped);
      setPendingImport({
        sessions: result.envelope.sessions.length,
        reflections: result.envelope.reflections.length,
      });
    };
    reader.onerror = () => toast.show('Failed to read file', 'error');
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function handleEnhancedFile(file: File) {
    const mine = ++selection.current;
    setBackup(null);
    setOutcome(null);
    setEncryptedText(null);
    setEncryptingExport(false);
    const tooLarge = refuseIfTooLarge(file.size);
    if (!tooLarge.ok) {
      setOutcome({ kind: 'refused', text: refusalMessage(tooLarge.error) });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (selection.current !== mine) return; // a newer file was chosen while this one was being read
      const text = String(reader.result);
      if (isEncryptedBackup(text)) {
        setEncryptedText(text); // asks for the passphrase; nothing is read until it opens
        return;
      }
      const result = parseEnvelope(text);
      if (!result.ok) {
        setOutcome({ kind: 'refused', text: refusalMessage(result.error) });
        return;
      }
      setBackup(result);
    };
    reader.onerror = () => {
      if (selection.current === mine) setOutcome({ kind: 'refused', text: refusalMessage('This file could not be read.') });
    };
    reader.readAsText(file);
  }

  /** Resolves with a message when the file did not open (the prompt stays), null when it did. */
  async function openEncrypted(passphrase: string): Promise<string | null> {
    if (!encryptedText) return null;
    const mine = selection.current;
    const opened = await decryptBackup(encryptedText, passphrase);
    // Opening takes a moment (deliberately). If another file was chosen meanwhile, this result belongs to a
    // file that is no longer the one on screen: say nothing and change nothing.
    if (selection.current !== mine) return null;
    if (!opened.ok) return opened.message;
    const parsed = parseEnvelope(JSON.stringify(opened.backup));
    setEncryptedText(null);
    if (!parsed.ok) {
      setOutcome({ kind: 'refused', text: refusalMessage(parsed.error) });
      return null;
    }
    setBackup({ ...parsed, secrets: opened.secrets });
    return null;
  }

  function importDone(text: string) {
    setBackup(null);
    setOutcome({ kind: 'done', text });
    qc.invalidateQueries();
  }

  async function confirmImport() {
    if (!pendingEnvelope) return;
    try {
      await replaceAll(pendingEnvelope);
      toast.show(`Imported ${pendingEnvelope.sessions.length} sessions`, 'success');
      if (pendingSkipped > 0) {
        toast.show(`Skipped ${pendingSkipped} invalid row${pendingSkipped === 1 ? '' : 's'} in the file`, 'error');
      }
      // Invalidate all queries to refresh UI
      qc.invalidateQueries();
    } catch (e) {
      toast.show(`Import failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
    setPendingEnvelope(null);
    setPendingImport(null);
    setPendingSkipped(0);
  }

  function cancelImport() {
    setPendingEnvelope(null);
    setPendingImport(null);
    setPendingSkipped(0);
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Backup & Restore
      </div>
      {storagePersistent != null && (
        <p className="text-xs text-text-muted mb-3">
          Storage: {storagePersistent ? 'persistent' : 'may be cleared by the browser'}
        </p>
      )}
      {enhanced ? (
        <p className="text-text-muted text-sm mb-4">
          Export everything you have saved as one JSON file. Your API keys, Google Calendar sign-in and private calendar link are not
          included: they stay on this device. An encrypted export can only be opened with a passphrase you choose, and you decide whether it
          also carries them. Importing shows you what will change first, and you choose whether to add only what is missing or to replace
          everything.
        </p>
      ) : (
        <p className="text-text-muted text-sm mb-4">
          Export everything (sessions, reflections, kata presets, coach threads, settings) as JSON. API keys are stripped from exports for safety.
          Importing replaces ALL local data — existing API keys are preserved when the import file has empty key fields.
          Any queued calendar-sync ops are also wiped (they&apos;re device-specific).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={handleExport}>Export JSON</Button>
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>Import JSON…</Button>
        {enhanced && encryptionAvailable() && (
          <Button
            variant="ghost"
            onClick={() => {
              setOutcome(null);
              setBackup(null);
              setEncryptedText(null);
              setEncryptingExport(true);
            }}
          >
            Export encrypted…
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {outcome && (
        <p role="status" className="mt-3 text-sm text-text" data-testid="backup-outcome">
          {outcome.text}
        </p>
      )}
      {enhanced && encryptingExport && (
        <EncryptedExportForm
          onCancel={() => setEncryptingExport(false)}
          onSaved={(text) => {
            setEncryptingExport(false);
            setOutcome({ kind: 'saved', text });
          }}
        />
      )}
      {enhanced && encryptedText && <PassphrasePrompt
          onOpen={openEncrypted}
          onCancel={() => {
            selection.current += 1; // an open still running for this file must not bring it back
            setEncryptedText(null);
          }}
        />}
      {enhanced && backup && <ImportPreview backup={backup} onDone={importDone} onCancel={() => { selection.current += 1; setBackup(null); }} />}

      <ConfirmDialog
        open={!enhanced && !!pendingImport}
        title="Replace all data?"
        message={
          pendingImport
            ? `This will WIPE all existing data and restore ${pendingImport.sessions} session${pendingImport.sessions === 1 ? '' : 's'} and ${pendingImport.reflections} reflection${pendingImport.reflections === 1 ? '' : 's'} from the file.${pendingSkipped > 0 ? ` ${pendingSkipped} invalid or duplicate record${pendingSkipped === 1 ? '' : 's'} in the file will be skipped.` : ''}${pendingSnapshotsDropped > 0 ? ` ${pendingSnapshotsDropped} review${pendingSnapshotsDropped === 1 ? '' : 's'} in the file had a summary this version cannot read; the review notes are kept and only the summary is left out.` : ''} Any queued calendar-sync ops will also be discarded. Cannot be undone.`
            : ''
        }
        confirmLabel="Replace all"
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </Card>
  );
}
