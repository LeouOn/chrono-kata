'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { collectAll, downloadExport } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { useQueryClient } from '@tanstack/react-query';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

export function DataTransfer() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ sessions: number; reflections: number } | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<ExportEnvelope | null>(null);

  async function handleExport() {
    try {
      const envelope = await collectAll();
      downloadExport(envelope);
      toast.show(`Exported ${envelope.sessions.length} sessions`, 'success');
    } catch (e) {
      toast.show(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseEnvelope(String(reader.result));
      if (!result.ok) {
        toast.show(`Import failed: ${result.error}`, 'error');
        return;
      }
      setPendingEnvelope(result.envelope);
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

  async function confirmImport() {
    if (!pendingEnvelope) return;
    try {
      await replaceAll(pendingEnvelope);
      toast.show(`Imported ${pendingEnvelope.sessions.length} sessions`, 'success');
      // Invalidate all queries to refresh UI
      qc.invalidateQueries();
    } catch (e) {
      toast.show(`Import failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
    setPendingEnvelope(null);
    setPendingImport(null);
  }

  function cancelImport() {
    setPendingEnvelope(null);
    setPendingImport(null);
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Backup & Restore
      </div>
      <p className="text-text-muted text-sm mb-4">
        Export all data (sessions, reflections, settings) as JSON. API keys are stripped from exports for safety.
        Importing replaces ALL local data — existing API keys are preserved when the import file has empty key fields.
        Any queued calendar-sync ops are also wiped (they&apos;re device-specific).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={handleExport}>Export JSON</Button>
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>Import JSON…</Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all data?"
        message={
          pendingImport
            ? `This will WIPE all existing data and restore ${pendingImport.sessions} session${pendingImport.sessions === 1 ? '' : 's'} and ${pendingImport.reflections} reflection${pendingImport.reflections === 1 ? '' : 's'} from the file. Any queued calendar-sync ops will also be discarded. Cannot be undone.`
            : ''
        }
        confirmLabel="Replace all"
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </Card>
  );
}
