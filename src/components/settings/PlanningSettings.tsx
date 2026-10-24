'use client';

import React, { useId, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { useDomains } from '@/hooks/useDomains';
import { dispatchToast } from '@/components/ui/Toast';
import { resolveAnchors, resolveWakingHours } from '@/lib/planning/resolve';
import { AnchorSchema, WakingHoursSchema, type Anchor, type WakingHours } from '@/lib/schemas/settings';
import { newId } from '@/lib/utils/id';

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function crossesMidnight(start: string, end: string): boolean {
  return end <= start;
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * The waking-hours inputs fire with '' every time somebody clears one to retype
 * it. That is an incomplete edit, not a failure: it must abort the write quietly
 * (no red toast), unlike a real storage error.
 */
export class IncompleteWakingHours extends Error {
  constructor() {
    super('Waking hours need a valid start and end time.');
    this.name = 'IncompleteWakingHours';
  }
}

/**
 * Planning settings (roadmap Wave 6, behind `taskInbox`): waking hours and the
 * recurring protected windows ("anchors"). Optional fields, saved through the
 * settings repository, so backups already round-trip them.
 */
export function PlanningSettings() {
  const enabled = useFlag('taskInbox');
  const { settings, updateSettings, updateSettingsWith } = useSettings();
  const { data: domains = [] } = useDomains({ enabled });
  const [editing, setEditing] = useState<{ anchor: Anchor; isNew: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Anchor | null>(null);
  const wakingHours = resolveWakingHours(settings);
  const anchors = resolveAnchors(settings);

  if (!enabled) return null;

  /**
   * Change one end of the waking window.
   *
   * The merge happens INSIDE the repository transaction, so the other end comes
   * from the stored row, not from a render snapshot: the two inputs save on every
   * change, and building `{ ...wakingHours, start }` here could revert an `end`
   * that had just been saved (or vice versa).
   *
   * The merged value is validated inside the merge: a cleared time input fires
   * with '', and a row that fails the schema must never be written (the importer
   * drops an invalid settings row wholesale). Throwing aborts the transaction, so
   * nothing is half-written either.
   */
  async function saveWakingHours(change: Partial<WakingHours>) {
    try {
      await updateSettingsWith((current) => {
        const next = { ...resolveWakingHours(current), ...change };
        const parsed = WakingHoursSchema.safeParse(next);
        if (!parsed.success) throw new IncompleteWakingHours();
        return { wakingHours: parsed.data };
      });
    } catch (error) {
      // A cleared field is an edit in progress: the transaction aborted, so
      // nothing was written, and the user does not need an error for it.
      if (error instanceof IncompleteWakingHours) return;
      dispatchToast(error instanceof Error ? error.message : 'Could not save waking hours', 'error');
    }
  }

  async function saveAnchors(next: Anchor[]) {
    try {
      await updateSettings({ anchors: next });
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : 'Could not save protected windows', 'error');
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-text">Planning (preview)</h2>
        <p className="text-xs text-text-muted mt-0.5">
          The hours you are awake, and windows you protect. Capacity is what remains for today&apos;s
          picks.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="waking-start" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
              Awake from
            </label>
            <input
              id="waking-start"
              type="time"
              value={wakingHours.start}
              onChange={(event) => void saveWakingHours({ start: event.target.value })}
              className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
            />
          </div>
          <div>
            <label htmlFor="waking-end" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
              Awake until
            </label>
            <input
              id="waking-end"
              type="time"
              value={wakingHours.end}
              onChange={(event) => void saveWakingHours({ end: event.target.value })}
              className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
            />
          </div>
        </div>
        {minutesOf(wakingHours.end) <= minutesOf(wakingHours.start) ? (
          <p className="text-[11px] text-text-muted">
            This window crosses midnight — the hours after midnight count towards the day it starts.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 pt-1 border-t border-border">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs uppercase tracking-wide text-text-muted">Protected windows</h3>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-3 text-sm border border-border bg-surface"
            onClick={() => setEditing({ anchor: newAnchor(), isNew: true })}
          >
            Add window
          </Button>
        </div>
        {anchors.length === 0 ? (
          <p className="text-xs text-text-muted">
            No protected windows yet. They keep other work out of the time you set aside.
          </p>
        ) : (
          <ul className="space-y-2">
            {anchors.map((anchor) => (
              <li key={anchor.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-text">{anchor.title}</p>
                  <p className="text-[11px] text-text-muted">
                    {anchor.weekdays
                      .slice()
                      .sort((a, b) => ((a || 7) - (b || 7)))
                      .map((day) => DAYS.find((entry) => entry.value === day)?.label ?? '')
                      .join(', ')}{' '}
                    · {anchor.start}–{anchor.end}
                    {crossesMidnight(anchor.start, anchor.end) ? ' (crosses midnight)' : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 px-3 text-sm"
                    aria-label={`Edit ${anchor.title}`}
                    onClick={() => setEditing({ anchor, isNew: false })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 px-3 text-sm"
                    aria-label={`Remove ${anchor.title}`}
                    onClick={() => setDeleteTarget(anchor)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <AnchorDialog
          key={editing.anchor.id}
          anchor={editing.anchor}
          domains={domains}
          onCancel={() => setEditing(null)}
          onSave={async (anchor) => {
            const next = editing.isNew
              ? [...anchors, anchor]
              : anchors.map((existing) => (existing.id === anchor.id ? anchor : existing));
            await saveAnchors(next);
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget != null}
        title="Remove this window?"
        message={`“${deleteTarget?.title ?? ''}” will stop protecting that time. Nothing else changes.`}
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void saveAnchors(anchors.filter((anchor) => anchor.id !== target.id));
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

function newAnchor(): Anchor {
  return {
    id: newId(),
    title: '',
    weekdays: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '11:00',
    domainId: null,
  };
}

function AnchorDialog({
  anchor,
  domains,
  onSave,
  onCancel,
}: {
  anchor: Anchor;
  domains: { id: string; name: string }[];
  onSave: (anchor: Anchor) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(anchor.title);
  const [weekdays, setWeekdays] = useState<number[]>(anchor.weekdays);
  const [start, setStart] = useState(anchor.start);
  const [end, setEnd] = useState(anchor.end);
  const [domainId, setDomainId] = useState<string | null>(anchor.domainId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weekdaysLabelId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const candidate = { ...anchor, title: title.trim(), weekdays, start, end, domainId };
    const parsed = AnchorSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the window details.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the window.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title={anchor.title === '' ? 'New protected window' : 'Edit protected window'} layer={2}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label htmlFor="anchor-title" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Title
          </label>
          <input
            id="anchor-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder="e.g. Trading session"
            className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
          />
        </div>

        <div>
          <span id={weekdaysLabelId} className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Days
          </span>
          <div role="group" aria-labelledby={weekdaysLabelId} className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => {
              const on = weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={day.label}
                  onClick={() =>
                    setWeekdays((current) =>
                      on ? current.filter((value) => value !== day.value) : [...current, day.value],
                    )
                  }
                  className={`py-2 rounded-xl text-xs font-medium transition-colors min-h-11 ${
                    on ? 'bg-accent text-base' : 'bg-surface-2 text-text-muted border border-border'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="anchor-start" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
              From
            </label>
            <input
              id="anchor-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
            />
          </div>
          <div>
            <label htmlFor="anchor-end" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
              Until
            </label>
            <input
              id="anchor-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
            />
          </div>
        </div>
        {crossesMidnight(start, end) ? (
          <p className="text-[11px] text-text-muted">
            This window crosses midnight, so it is protected until {end} the next morning.
          </p>
        ) : null}

        <div>
          <label htmlFor="anchor-domain" className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Belongs to domain (optional)
          </label>
          <select
            id="anchor-domain"
            value={domainId ?? ''}
            onChange={(event) => setDomainId(event.target.value === '' ? null : event.target.value)}
            className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
          >
            <option value="">No domain — keeps every domain out</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-hype">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Save window'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
