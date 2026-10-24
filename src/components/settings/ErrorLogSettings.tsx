'use client';

import React, { useId, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useFlag } from '@/hooks/useFlags';
import {
  clearErrorLog,
  exportErrorLogText,
  getErrorLog,
} from '@/lib/errors/error-log';

/**
 * The local error log viewer (roadmap Wave 20 part 1), behind the preview
 * flag like the other new settings cards. The log never leaves the device
 * unless the user exports it right here.
 */
export function ErrorLogSettings() {
  const enabled = useFlag('taskInbox');
  const [entries, setEntries] = useState<ReturnType<typeof getErrorLog> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const exportNoteId = useId();

  if (!enabled) return null;

  const refresh = () => setEntries(getErrorLog());
  const shown = entries ?? getErrorLog();

  function downloadTextFile(text: string, filename: string): boolean {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  async function exportLog() {
    const text = exportErrorLogText(shown);
    const filename = `chrono-kata-error-log-${new Date().toISOString().slice(0, 10)}.txt`;
    if (downloadTextFile(text, filename)) {
      setExportNote('Downloaded.');
      return;
    }
    // Download failed (some WebViews): offer share, then clipboard.
    try {
      if (navigator.share) {
        await navigator.share({ title: filename, text });
        setExportNote('Shared.');
        return;
      }
    } catch {
      // User dismissed or share failed: fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(text);
      setExportNote('Copied to the clipboard.');
    } catch {
      setExportNote('Could not export on this device.');
    }
  }

  return (
    <Card className="space-y-3" aria-label="Error log">
      <div>
        <h2 className="text-sm font-medium text-text">Error log</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Kept on this device only — the newest {Math.min(shown.length, 50)} record
          {shown.length === 1 ? '' : 's'}. Never sent anywhere.
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing recorded.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto space-y-2" aria-label="Recorded errors">
          {shown
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${e.at}-${i}`} className="text-xs text-text border-b border-border pb-2">
                <p className="text-text-muted">
                  {new Date(e.at).toLocaleString()} · {e.route}
                </p>
                <p className="break-words">
                  {e.name}: {e.message}
                  {e.messageTruncated ? ' (trimmed)' : ''}
                </p>
              </li>
            ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => void exportLog()}
          disabled={shown.length === 0}
          aria-describedby={shown.length === 0 ? undefined : exportNoteId}
        >
          Export
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={refresh}>
          Refresh
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => setConfirmClear(true)}
          disabled={shown.length === 0}
        >
          Clear
        </Button>
      </div>
      {shown.length > 0 && (
        <p id={exportNoteId} className="text-xs text-text-muted">
          Entries can include short fragments of your own text. Read them before you share the file.
        </p>
      )}
      {exportNote && (
        <p role="status" className="text-xs text-text-muted">
          {exportNote}
        </p>
      )}

      <ConfirmDialog
        open={confirmClear}
        onCancel={() => setConfirmClear(false)}
        title="Clear the error log?"
        message="The recorded error details on this device are removed. Your practice data is untouched."
        confirmLabel="Clear log"
        onConfirm={() => {
          clearErrorLog();
          setEntries([]);
          setConfirmClear(false);
        }}
      />
    </Card>
  );
}
