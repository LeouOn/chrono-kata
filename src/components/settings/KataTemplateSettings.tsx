'use client';

import { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useKataTemplates } from '@/hooks/useKataTemplates';
import { useSettings } from '@/hooks/useSettings';
import { dispatchToast } from '@/components/ui/Toast';
import type { KataTemplate, KataTemplateInput } from '@/lib/schemas/kata-template';
import type { Intensity } from '@/lib/pacing/types';
import { formatDuration } from '@/lib/utils/format';
import { KATA_ICON_CATEGORIES } from '@/lib/kata/icons';

const INTENSITY_LABELS = {
  1: 'Gentle',
  2: 'Moderate',
  3: 'Hard',
} as const;

export function KataTemplateSettings() {
  const { templates, createTemplate, updateTemplate, deleteTemplate, reorderTemplates } = useKataTemplates();
  const { settings, updateSettings } = useSettings();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<KataTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KataTemplate | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'timed' | 'reps'>('timed');
  const [duration, setDuration] = useState<number | null>(20);
  const [reps, setReps] = useState<number | null>(null);
  const [activityLabel, setActivityLabel] = useState('');
  const [defaultNote, setDefaultNote] = useState('');
  const [icon, setIcon] = useState('🥋');
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingTemplate(null);
    setName('');
    setMode('timed');
    setDuration(20);
    setReps(null);
    setActivityLabel('');
    setDefaultNote('');
    setIcon('🥋');
    setIntensity(2);
    setError(null);
    setModalOpen(true);
  }

  function handleDeleteClick(t: KataTemplate) {
    if (settings?.confirmKataDelete === false) {
      void deleteTemplate(t.id);
    } else {
      setDeleteTarget(t);
    }
  }

  async function handleDeleteConfirm(dontAskAgain: boolean) {
    try {
      if (dontAskAgain) await updateSettings({ confirmKataDelete: false });
      if (deleteTarget) await deleteTemplate(deleteTarget.id);
    } catch (e) {
      dispatchToast(e instanceof Error ? e.message : 'Failed to delete kata', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  function openEdit(t: KataTemplate) {
    setEditingTemplate(t);
    setName(t.name);
    setMode(t.mode);
    setDuration(t.defaultDurationMinutes ?? null);
    setReps(t.defaultReps ?? null);
    setActivityLabel(t.activityLabel ?? '');
    setDefaultNote(t.defaultNote ?? '');
    setIcon(t.icon ?? '🥋');
    setIntensity(t.intensity ?? 1);
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a routine name.');
      return;
    }

    const payload: KataTemplateInput = {
      name: name.trim(),
      mode,
      defaultDurationMinutes: mode === 'timed' ? duration : null,
      defaultReps: mode === 'reps' ? reps : null,
      activityLabel: activityLabel.trim() || undefined,
      defaultNote: defaultNote.trim() || undefined,
      icon,
      intensity,
    };

    try {
      if (editingTemplate) {
        await updateTemplate({ id: editingTemplate.id, patch: payload });
      } else {
        await createTemplate(payload);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  }

  async function handleMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= templates.length) return;

    const copy = [...templates];
    const item = copy[idx]!;
    copy.splice(idx, 1);
    copy.splice(targetIdx, 0, item);

    await reorderTemplates(copy.map((t) => t.id));
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-text-muted text-xs uppercase tracking-wide">
            Practice Katas
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            1-tap presets for your deliberate practice routines.
          </div>
        </div>
        <Button variant="ghost" onClick={openCreate} className="text-xs flex items-center gap-1">
          <Plus size={14} /> Add Kata
        </Button>
      </div>

      <div className="divide-y divide-border -mx-4 px-4">
        {templates.map((t, idx) => (
          <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">{t.icon || '🥋'}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text truncate">{t.name}</div>
                <div className="text-xs text-text-muted flex items-center gap-1.5">
                  <span>
                    {t.mode === 'timed' && t.defaultDurationMinutes != null
                      ? formatDuration(t.defaultDurationMinutes)
                      : t.mode === 'reps' && t.defaultReps != null
                        ? `${t.defaultReps} reps`
                        : t.mode}
                  </span>
                  {t.activityLabel && (
                    <>
                      <span>•</span>
                      <span className="truncate">{t.activityLabel}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => void handleMove(idx, 'up')}
                disabled={idx === 0}
                className="p-1 text-text-muted hover:text-text disabled:opacity-20 transition-colors"
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => void handleMove(idx, 'down')}
                disabled={idx === templates.length - 1}
                className="p-1 text-text-muted hover:text-text disabled:opacity-20 transition-colors"
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => openEdit(t)}
                className="p-1 text-text-muted hover:text-text transition-colors"
                title="Edit kata"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteClick(t)}
                className="p-1 text-text-muted hover:text-hype transition-colors"
                title="Delete kata"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTemplate ? 'Edit Kata Preset' : 'New Kata Preset'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Icon picker */}
          <div>
            <label className="text-text-muted block mb-1">Icon</label>
            <div className="max-h-44 overflow-y-auto pr-1">
              {KATA_ICON_CATEGORIES.map((category) => (
                <div key={category.label} className="mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
                    {category.label}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {category.icons.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setIcon(ic)}
                        className={`text-xl p-1.5 rounded-xl transition-transform ${
                          icon === ic
                            ? 'bg-accent/20 scale-110 border border-accent'
                            : 'bg-surface-2'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Routine Name */}
          <div>
            <label className="text-text-muted block mb-1">Routine Name</label>
            <input
              type="text"
              required
              maxLength={50}
              placeholder="e.g. Morning Zazen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
            />
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-xl">
            {(['timed', 'reps'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-1.5 rounded-lg font-medium capitalize transition-colors ${
                  mode === m ? 'bg-accent text-base' : 'text-text-muted'
                }`}
              >
                {m === 'timed' ? '⏱ Timed' : '⊙ Reps'}
              </button>
            ))}
          </div>

          {/* Target Value */}
          {mode === 'timed' ? (
            <div>
              <label className="text-text-muted block mb-1">Default Duration (minutes)</label>
              <input
                type="number"
                min="1"
                max="1440"
                value={duration ?? ''}
                onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
                placeholder="20"
                className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="text-text-muted block mb-1">Default Repetitions</label>
              <input
                type="number"
                min="1"
                max="100000"
                value={reps ?? ''}
                onChange={(e) => setReps(e.target.value ? Number(e.target.value) : null)}
                placeholder="50"
                className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
              />
            </div>
          )}

          {/* Intensity */}
          <div>
            <label className="text-text-muted block mb-1">Intensity</label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-surface-2 rounded-xl">
              {([1, 2, 3] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={intensity === level}
                  onClick={() => setIntensity(level)}
                  className={`py-1.5 rounded-lg font-medium transition-colors ${
                    intensity === level ? 'bg-accent text-base' : 'text-text-muted'
                  }`}
                >
                  {INTENSITY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Activity label */}
          <div>
            <label className="text-text-muted block mb-1">Activity Label (optional)</label>
            <input
              type="text"
              maxLength={50}
              placeholder="e.g. Meditation, Deep Work"
              value={activityLabel}
              onChange={(e) => setActivityLabel(e.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
            />
          </div>

          {/* Default note */}
          <div>
            <label className="text-text-muted block mb-1">Default Note (optional)</label>
            <textarea
              maxLength={500}
              rows={2}
              placeholder="Prompt or focal points for this kata"
              value={defaultNote}
              onChange={(e) => setDefaultNote(e.target.value)}
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none resize-none"
            />
          </div>

          {error && <p className="text-xs text-hype">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Save Kata
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete kata?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? Past sessions keep their labels.`
            : ''
        }
        confirmLabel="Delete"
        showDontAskAgain
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
