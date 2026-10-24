'use client';

import React, { useId, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Block } from '@/lib/schemas/block';
import { clockInWakingWindow } from '@/lib/planning/time';

function toTimeValue(instant: number): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseClock(value: string): string | null {
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

export interface BlockSheetProps {
  open: boolean;
  /** Existing block for edit, or defaults for a new commitment. */
  initial?: { id?: string; kind: 'fixed' | 'focus'; title: string; start: number; end: number };
  /** The waking window this day's clock belongs to (overnight aware). */
  window: { start: number; end: number };
  /** Task title for a focus block's heading and aria label. */
  focusTaskTitle?: string;
  onClose: () => void;
  onSave: (fields: { title: string; start: number; end: number }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/**
 * Accessible add/edit sheet for a timeline block. Drag/resize (PR 3) is never
 * the only way: every change can be made here with labelled time inputs.
 */
export function BlockSheet({ open, initial, window, focusTaskTitle, onClose, onSave, onDelete }: BlockSheetProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [from, setFrom] = useState(initial ? toTimeValue(initial.start) : '10:00');
  const [until, setUntil] = useState(initial ? toTimeValue(initial.end) : '11:00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savingRef = useRef(false);
  const titleId = useId();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const startClock = parseClock(from);
    const endClock = parseClock(until);
    const start = startClock ? clockInWakingWindow(window.start, window.end, startClock) : null;
    const end = start != null && endClock ? clockInWakingWindow(window.start, window.end, endClock, true) : null;
    if (!title.trim()) {
      setError('Give this block a title.');
      return;
    }
    if (start == null || end == null) {
      setError('Pick a start and end time.');
      return;
    }
    if (end <= start) {
      setError('The end time needs to be after the start.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), start, end });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the block.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          initial?.kind === 'focus'
            ? `Focus block for ${focusTaskTitle ?? initial.title}`
            : initial
              ? 'Edit block'
              : 'Add a commitment'
        }
      >
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          {initial?.kind !== 'focus' ? (
            <div>
              <label htmlFor={titleId} className="text-xs uppercase tracking-wide text-text-muted block mb-1">
                Title
              </label>
              <input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="e.g. Dentist, school run"
                className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="block-from" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
                From
              </label>
              <input
                id="block-from"
                type="time"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
              />
            </div>
            <div>
              <label htmlFor="block-until" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
                Until
              </label>
              <input
                id="block-until"
                type="time"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-hype">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1" disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save block'}
            </Button>
          </div>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              Remove this block
            </Button>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this block?"
        message="Only this block is removed. Nothing else changes."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        layer={2}
        onConfirm={() => {
          setConfirmDelete(false);
          void Promise.resolve(onDelete?.()).catch((e: unknown) => {
            setError(e instanceof Error ? e.message : 'Could not remove the block.');
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

export type { Block };
