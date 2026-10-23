'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { useInbox, useCaptureTasks } from '@/hooks/useTasks';
import { useDomains } from '@/hooks/useDomains';
import { parseCapture, type CaptureDomain } from '@/lib/capture/parse-capture';
import { captureToTaskInput } from '@/lib/capture/task-input';
import { splitBulk } from '@/lib/capture/split-bulk';
import { messageOf } from '@/lib/tasks/messages';
import type { TaskInput } from '@/lib/schemas/task';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface BulkRow {
  key: number;
  line: string;
}

function formatDay(dayKey: string | null): string | null {
  if (!dayKey) return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year!, month! - 1, day!, 12).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Capture sheet: one line in, one inbox task out, ready for the next line.
 * Parsing is the Wave 2 part 1 parser; the parsed chips show what was
 * understood and the raw text stays in the title when nothing matches.
 * Pasting several lines switches to a preview where every row can be edited
 * or dropped before anything is saved.
 */
export function CaptureSheet({ open, onClose }: Props) {
  const toast = useToast();
  const { createTask } = useInbox();
  const { mutateAsync: createMany } = useCaptureTasks();
  const { data: domains = [] } = useDomains();
  const [line, setLine] = useState('');
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const captureDomains: CaptureDomain[] = useMemo(
    () => domains.map((domain) => ({ id: domain.id, name: domain.name })),
    [domains],
  );

  const parsed = useMemo(
    () => parseCapture(line, { now: new Date(), domains: captureDomains }),
    [line, captureDomains],
  );
  const domainName = parsed.domainId
    ? (domains.find((domain) => domain.id === parsed.domainId)?.name ?? null)
    : null;

  useEffect(() => {
    if (!open) return;
    setLine('');
    setBulk(null);
    setError(null);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(focus);
  }, [open]);

  async function saveOne(raw: string): Promise<boolean> {
    const parsedLine = parseCapture(raw, { now: new Date(), domains: captureDomains });
    const input: TaskInput | null = captureToTaskInput(parsedLine);
    if (!input) return false;
    await createTask(input);
    return true;
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (saving) return;
    const raw = line;
    if (raw.trim() === '') return;
    // A paste that slipped through as a multi-line value goes to the preview.
    if (splitBulk(raw).length > 1) {
      setBulk(splitBulk(raw).map((value, index) => ({ key: index, line: value })));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveOne(raw);
      if (saved) {
        setLine('');
        toast.show('Added to the inbox.', 'success');
        inputRef.current?.focus();
      }
    } catch (e) {
      // Keep the text in the field; say what happened instead of nothing.
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (!text || !text.includes('\n')) return;
    event.preventDefault();
    const lines = splitBulk(text);
    if (lines.length === 0) return;
    setBulk(lines.map((value, index) => ({ key: index, line: value })));
  }

  async function saveBulk() {
    if (!bulk || saving) return;
    setSaving(true);
    setError(null);
    try {
      const inputs: TaskInput[] = [];
      for (const row of bulk) {
        const parsedRow = parseCapture(row.line, { now: new Date(), domains: captureDomains });
        const input = captureToTaskInput(parsedRow);
        if (input) inputs.push(input);
      }
      if (inputs.length === 0) {
        setBulk(null);
        return;
      }
      await createMany(inputs);
      toast.show(inputs.length === 1 ? 'Added 1 item.' : `Added ${inputs.length} items.`, 'success');
      setBulk(null);
      setLine('');
      inputRef.current?.focus();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  const chips: string[] = [];
  if (domainName) chips.push(domainName);
  if (parsed.estimateMin) chips.push(`~${parsed.estimateMin}m`);
  if (parsed.energy) chips.push(`${parsed.energy} energy`);
  const day = formatDay(parsed.deferUntil);
  if (day) chips.push(day);
  for (const context of parsed.contexts) chips.push(`@${context}`);
  if (parsed.unknownDomainTags.length > 0) chips.push(parsed.unknownDomainTags.join(' '));

  return (
    <Modal open={open} onClose={onClose} title={bulk ? 'Add several tasks' : 'Capture'}
      layer={2}>
      {bulk ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            {bulk.length === 1 ? '1 line found.' : `${bulk.length} lines found.`} Edit or drop any
            row, then add the rest. Nothing is saved until you press Add.
          </p>
          <ul className="space-y-2">
            {bulk.map((row) => (
              <li key={row.key} className="flex items-start gap-2">
                <label className="sr-only" htmlFor={`bulk-${row.key}`}>
                  Line {row.key + 1}
                </label>
                <input
                  id={`bulk-${row.key}`}
                  value={row.line}
                  onChange={(event) =>
                    setBulk((rows) =>
                      (rows ?? []).map((item) =>
                        item.key === row.key ? { ...item, line: event.target.value } : item,
                      ),
                    )
                  }
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text min-h-11"
                />
                <Button
                  variant="ghost"
                  aria-label={`Drop line ${row.key + 1}`}
                  onClick={() => setBulk((rows) => (rows ?? []).filter((item) => item.key !== row.key))}
                >
                  Drop
                </Button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className="text-sm text-hype">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={() => void saveBulk()} disabled={saving || bulk.length === 0}>
              {bulk.length === 1 ? 'Add 1' : `Add ${bulk.length}`}
            </Button>
            <Button variant="ghost" onClick={() => setBulk(null)} disabled={saving}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="sr-only" htmlFor="capture-input">
            Task to capture
          </label>
          <input
            id="capture-input"
            ref={inputRef}
            value={line}
            onChange={(event) => setLine(event.target.value)}
            onPaste={handlePaste}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="fix hose #life ~20m !high tomorrow @hardware-store"
            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-text min-h-11"
          />
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-[11px] text-text-muted" aria-live="polite">
              {chips.map((chip) => (
                <span key={chip} className="rounded-full border border-border px-2 py-0.5">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-text-muted">
            Enter adds it and keeps the field ready. Paste several lines for a preview.
            {parsed.title && parsed.title !== line ? (
              <>
                {' '}
                Title: <span className="text-text">{parsed.title}</span>
              </>
            ) : null}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-hype">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || line.trim() === ''}>
              Add to inbox
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** The capture entry point: a distinct button above the practice FAB. */
export function CaptureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Capture a task"
      className="fixed bottom-[9rem] right-4 z-10 h-11 min-w-11 rounded-full border border-border bg-surface text-text-muted shadow-sm flex items-center justify-center px-3 gap-1.5 text-xs"
    >
      <span aria-hidden>＋</span>
      <span>Task</span>
    </button>
  );
}

