'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowUp, ArrowDown, Archive, ArchiveRestore } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useHabits } from '@/hooks/useHabits';
import { dispatchToast } from '@/components/ui/Toast';
import type { DayOfWeek } from '@/lib/schemas/settings';
import type { Habit, HabitInput, HabitKind, HabitSchedule } from '@/lib/schemas/habit';

const DAYS: Array<{ id: DayOfWeek; label: string }> = [
  { id: 'mon', label: 'M' },
  { id: 'tue', label: 'T' },
  { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' },
  { id: 'fri', label: 'F' },
  { id: 'sat', label: 'S' },
  { id: 'sun', label: 'S' },
];

const KINDS: Array<{ id: HabitKind; label: string }> = [
  { id: 'timed', label: '⏱ Timed' },
  { id: 'boolean', label: '✓ Yes/No' },
  { id: 'count', label: '# Count' },
];

export function HabitSettings() {
  const { habits, createHabit, updateHabit, deleteHabit, reorderHabits, setHabitArchived } = useHabits();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);

  const active = habits.filter((h) => h.archivedAt == null);
  const archived = habits.filter((h) => h.archivedAt != null);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✅');
  const [kind, setKind] = useState<HabitKind>('boolean');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [scheduleKind, setScheduleKind] = useState<'daily' | 'weekdays'>('daily');
  const [weekdays, setWeekdays] = useState<DayOfWeek[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [linkedLabel, setLinkedLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingHabit(null);
    setName('');
    setIcon('✅');
    setKind('boolean');
    setUnit('');
    setTarget(null);
    setScheduleKind('daily');
    setWeekdays(['mon', 'tue', 'wed', 'thu', 'fri']);
    setLinkedLabel('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(h: Habit) {
    setEditingHabit(h);
    setName(h.name);
    setIcon(h.icon || '✅');
    setKind(h.kind);
    setUnit(h.unit ?? '');
    setTarget(h.targetPerDay ?? null);
    setScheduleKind(h.schedule.kind);
    setWeekdays(h.schedule.kind === 'weekdays' ? h.schedule.days : ['mon', 'tue', 'wed', 'thu', 'fri']);
    setLinkedLabel(h.linkedActivityLabel ?? '');
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a habit name.');
      return;
    }
    if (kind !== 'boolean' && (target == null || target <= 0)) {
      setError('Enter a daily target greater than 0.');
      return;
    }
    if (kind === 'count' && !unit.trim()) {
      setError('Enter a unit (e.g. "pages").');
      return;
    }
    const schedule: HabitSchedule =
      scheduleKind === 'daily'
        ? { kind: 'daily' }
        : { kind: 'weekdays', days: weekdays.length > 0 ? weekdays : ['mon'] };

    const payload: HabitInput = {
      name: name.trim(),
      icon: icon.trim() || '✅',
      kind,
      unit: kind === 'count' ? unit.trim() : undefined,
      targetPerDay: kind === 'boolean' ? null : target,
      schedule,
      linkedActivityLabel: linkedLabel.trim() || null,
    };

    try {
      if (editingHabit) {
        await updateHabit({ id: editingHabit.id, patch: payload });
      } else {
        await createHabit(payload);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save habit');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteHabit(deleteTarget.id);
    } catch (e) {
      dispatchToast(e instanceof Error ? e.message : 'Failed to delete habit', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= active.length) return;
    const copy = [...active];
    const item = copy[idx]!;
    copy.splice(idx, 1);
    copy.splice(targetIdx, 0, item);
    await reorderHabits(copy.map((h) => h.id));
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-text-muted text-xs uppercase tracking-wide">Habits</div>
          <div className="text-xs text-text-muted mt-0.5">
            Small daily practices tracked separately from sessions.
          </div>
        </div>
        <Button variant="ghost" onClick={openCreate} className="text-xs flex items-center gap-1">
          <Plus size={14} /> Add Habit
        </Button>
      </div>

      <div className="divide-y divide-border -mx-4 px-4">
        {habits.length === 0 && (
          <p className="py-3 text-xs text-text-muted italic">
            No habits yet. Add one for things like watering plants or reading pages.
          </p>
        )}
        {active.map((h, idx) => (
          <div key={h.id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">{h.icon || '✅'}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text truncate">{h.name}</div>
                <div className="text-xs text-text-muted truncate">
                  {h.kind === 'timed'
                    ? `${h.targetPerDay ?? '—'} min daily`
                    : h.kind === 'count'
                      ? `${h.targetPerDay ?? '—'} ${h.unit ?? ''} daily`
                      : 'Yes/No'}
                  {' · '}
                  {h.schedule.kind === 'daily'
                    ? 'every day'
                    : h.schedule.days.map((d) => d[0]?.toUpperCase()).join(' ')}
                  {h.linkedActivityLabel ? ` · links to "${h.linkedActivityLabel}"` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => void handleMove(idx, 'up')} disabled={idx === 0} className="p-1 text-text-muted hover:text-text disabled:opacity-20" title="Move up">
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => void handleMove(idx, 'down')} disabled={idx === active.length - 1} className="p-1 text-text-muted hover:text-text disabled:opacity-20" title="Move down">
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => openEdit(h)} className="p-1 text-text-muted hover:text-text" title="Edit habit">
                <Edit2 size={14} />
              </button>
              <button type="button" onClick={() => void setHabitArchived({ id: h.id, archived: true })} className="p-1 text-text-muted hover:text-accent" title="Archive habit (keeps history)">
                <Archive size={14} />
              </button>
              <button type="button" onClick={() => setDeleteTarget(h)} className="p-1 text-text-muted hover:text-hype" title="Delete habit">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {archived.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wide text-text-muted pt-3 pb-1">
              Archived
            </div>
            {archived.map((h) => (
              <div key={h.id} className="py-2 flex items-center justify-between gap-2 opacity-60">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">{h.icon || '✅'}</span>
                  <div className="text-sm text-text truncate">{h.name}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => void setHabitArchived({ id: h.id, archived: false })} className="p-1 text-text-muted hover:text-text" title="Restore habit">
                    <ArchiveRestore size={14} />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(h)} className="p-1 text-text-muted hover:text-hype" title="Delete habit">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingHabit ? 'Edit Habit' : 'New Habit'}>
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div>
              <label className="text-text-muted block mb-1">Icon</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={10}
                className="w-14 text-center bg-surface-2 rounded-xl px-2 py-2 text-lg text-text border border-border outline-none"
                aria-label="Habit icon"
              />
            </div>
            <div>
              <label className="text-text-muted block mb-1">Name</label>
              <input
                type="text"
                required
                maxLength={50}
                placeholder="e.g. Water plants, Read pages"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-text-muted block mb-1">Kind</label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-surface-2 rounded-xl">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`py-1.5 rounded-lg font-medium transition-colors ${
                    kind === k.id ? 'bg-accent text-base' : 'text-text-muted'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {kind !== 'boolean' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-text-muted block mb-1">
                  Daily target {kind === 'timed' ? '(minutes)' : `(${unit.trim() || 'units'})`}
                </label>
                <input
                  type="number"
                  min={kind === 'timed' ? 'any' : '1'}
                  step={kind === 'timed' ? 'any' : '1'}
                  value={target ?? ''}
                  onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : null)}
                  placeholder={kind === 'timed' ? 'e.g. 20' : 'e.g. 10'}
                  className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
                />
              </div>
              {kind === 'count' && (
                <div>
                  <label className="text-text-muted block mb-1">Unit</label>
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="e.g. pages"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-text-muted block mb-1">Schedule</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-xl mb-2">
              {(['daily', 'weekdays'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScheduleKind(s)}
                  className={`py-1.5 rounded-lg font-medium transition-colors ${
                    scheduleKind === s ? 'bg-accent text-base' : 'text-text-muted'
                  }`}
                >
                  {s === 'daily' ? 'Every day' : 'Selected days'}
                </button>
              ))}
            </div>
            {scheduleKind === 'weekdays' && (
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => {
                  const on = weekdays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setWeekdays((prev) => (on ? prev.filter((x) => x !== d.id) : [...prev, d.id]))
                      }
                      className={`py-2 rounded-xl font-semibold transition-colors ${
                        on ? 'bg-accent text-base' : 'bg-surface-2 text-text-muted'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-text-muted block mb-1">Link to sessions (optional)</label>
            <input
              type="text"
              maxLength={100}
              placeholder="Activity label, e.g. Daily stretches"
              value={linkedLabel}
              onChange={(e) => setLinkedLabel(e.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
            />
            <p className="text-[10px] text-text-muted mt-1">
              Sessions with a matching activity label count toward this habit automatically.
            </p>
          </div>

          {error && <p className="text-xs text-hype">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Save Habit
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete habit?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}" and all of its history? Archiving keeps the history instead.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
