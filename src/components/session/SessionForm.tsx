'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { RatingPicker } from './RatingPicker';
import { Timer } from './Timer';
import type { Session, SessionInput } from '@/lib/schemas/session';
import type { Rating } from '@/lib/schemas/session';

type Mode = 'timed' | 'reps';

interface Props {
  open: boolean;
  initial?: Session | null;
  onSave: (input: SessionInput) => void;
  onCancel: () => void;
}

export function SessionForm({ open, initial, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('timed');
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    initial?.durationMinutes ?? null
  );
  const [reps, setReps] = useState<number | null>(initial?.reps ?? null);
  const [rating, setRating] = useState<Rating | null>(initial?.rating ?? null);
  const [activityLabel, setActivityLabel] = useState(initial?.activityLabel ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleTimerStop(minutes: number) {
    setDurationMinutes(minutes);
    setTimerStartedAt(null);
    if (mode !== 'timed') setMode('timed');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (rating == null) {
      setError('Pick a rating.');
      return;
    }
    if (mode === 'timed' && durationMinutes == null) {
      setError('Start the timer or enter a duration.');
      return;
    }
    if (mode === 'reps' && (reps == null || reps < 1)) {
      setError('Enter a rep count.');
      return;
    }

    const input: SessionInput = {
      startedAt: initial?.startedAt ?? (timerStartedAt ?? new Date()),
      endedAt: mode === 'timed' ? new Date() : null,
      durationMinutes: mode === 'timed' ? durationMinutes : null,
      reps: mode === 'reps' ? reps : null,
      rating,
      activityLabel: activityLabel.trim() || undefined,
      note: note.trim() || undefined,
    };
    onSave(input);
  }

  return (
    <Modal open={open} onClose={onCancel} title={initial ? 'Edit session' : 'New session'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-2xl">
          {(['timed', 'reps'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-2 rounded-xl text-sm capitalize transition-colors ${
                mode === m ? 'bg-accent text-base' : 'text-text-muted'
              }`}
            >
              {m === 'timed' ? '⏱ Timed' : '⊙ Reps'}
            </button>
          ))}
        </div>

        {/* Mode-specific input */}
        {mode === 'timed' ? (
          timerStartedAt || durationMinutes == null ? (
            <Timer
              startedAt={timerStartedAt}
              onStart={() => {
                setTimerStartedAt(new Date());
                setDurationMinutes(null);
              }}
              onStop={handleTimerStop}
              onReset={() => {
                setTimerStartedAt(null);
                setDurationMinutes(null);
              }}
            />
          ) : (
            <label className="block">
              <span className="text-text-muted text-sm">Duration (minutes)</span>
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text font-serif text-2xl"
              />
            </label>
          )
        ) : (
          <label className="block">
            <span className="text-text-muted text-sm">Reps</span>
            <input
              type="number"
              min={1}
              value={reps ?? ''}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text font-serif text-2xl"
            />
          </label>
        )}

        {/* Activity label */}
        <label className="block">
          <span className="text-text-muted text-sm">Activity (optional)</span>
          <input
            type="text"
            maxLength={100}
            value={activityLabel}
            onChange={(e) => setActivityLabel(e.target.value)}
            placeholder="meditation, trading review, push-ups…"
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>

        {/* Rating */}
        <div>
          <div className="text-text-muted text-sm mb-2">Rating</div>
          <RatingPicker value={rating} onChange={setRating} />
        </div>

        {/* Note */}
        <label className="block">
          <span className="text-text-muted text-sm">Note (optional)</span>
          <textarea
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text resize-none"
          />
        </label>

        {error && <p className="text-hype text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{initial ? 'Save changes' : 'Save session'}</Button>
        </div>
      </form>
    </Modal>
  );
}
