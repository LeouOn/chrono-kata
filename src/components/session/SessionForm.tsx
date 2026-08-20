'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { RatingPicker } from './RatingPicker';
import { SliderRatingPicker } from './SliderRatingPicker';
import { DotsRatingPicker } from './DotsRatingPicker';
import { MultiDimSlider } from './MultiDimSlider';
import { Timer } from './Timer';
import { useSettings } from '@/hooks/useSettings';
import type { Session, SessionInput } from '@/lib/schemas/session';
import type { Rating, MultiDimRating } from '@/lib/schemas/session';
import type { KataTemplate } from '@/lib/schemas/kata-template';

type Mode = 'timed' | 'reps';

interface Props {
  open: boolean;
  initial?: Session | null;
  initialTemplate?: KataTemplate | null;
  onSave: (input: SessionInput) => void;
  onCancel: () => void;
}

export function SessionForm({ open, initial, initialTemplate, onSave, onCancel }: Props) {
  const { settings } = useSettings();
  const ratingStyle = settings?.ratingStyle ?? 'slider';
  const [mode, setMode] = useState<Mode>(
    initial?.durationMinutes != null
      ? 'timed'
      : initial?.reps != null
        ? 'reps'
        : initialTemplate?.mode ?? 'timed'
  );
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    initial?.durationMinutes ?? initialTemplate?.defaultDurationMinutes ?? null
  );
  const [reps, setReps] = useState<number | null>(
    initial?.reps ?? initialTemplate?.defaultReps ?? null
  );
  const [rating, setRating] = useState<Rating | null>(initial?.rating ?? null);
  const [focusRating, setFocusRating] = useState<MultiDimRating | null>(initial?.focusRating ?? null);
  const [energyRating, setEnergyRating] = useState<MultiDimRating | null>(initial?.energyRating ?? null);
  const [moodRating, setMoodRating] = useState<MultiDimRating | null>(initial?.moodRating ?? null);
  const [activityLabel, setActivityLabel] = useState(
    initial?.activityLabel ?? initialTemplate?.activityLabel ?? ''
  );
  const [note, setNote] = useState(initial?.note ?? initialTemplate?.defaultNote ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initial) {
        setMode(initial.durationMinutes != null ? 'timed' : 'reps');
        setDurationMinutes(initial.durationMinutes ?? null);
        setReps(initial.reps ?? null);
        setRating(initial.rating ?? null);
        setFocusRating(initial.focusRating ?? null);
        setEnergyRating(initial.energyRating ?? null);
        setMoodRating(initial.moodRating ?? null);
        setActivityLabel(initial.activityLabel ?? '');
        setNote(initial.note ?? '');
      } else if (initialTemplate) {
        setMode(initialTemplate.mode);
        setDurationMinutes(initialTemplate.defaultDurationMinutes ?? null);
        setReps(initialTemplate.defaultReps ?? null);
        setRating(null);
        setFocusRating(null);
        setEnergyRating(null);
        setMoodRating(null);
        setActivityLabel(initialTemplate.activityLabel ?? '');
        setNote(initialTemplate.defaultNote ?? '');
      } else {
        setMode('timed');
        setDurationMinutes(null);
        setReps(null);
        setRating(null);
        setFocusRating(null);
        setEnergyRating(null);
        setMoodRating(null);
        setActivityLabel('');
        setNote('');
      }
      setTimerStartedAt(null);
      setError(null);
    }
  }, [open, initial, initialTemplate]);

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
      focusRating,
      energyRating,
      moodRating,
    };
    onSave(input);
  }

  return (
    <Modal open={open} onClose={onCancel} title={initial ? 'Edit session' : initialTemplate ? `Start ${initialTemplate.name}` : 'New session'}>
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
            <div className="space-y-3">
              <Timer
                startedAt={timerStartedAt}
                onStart={() => setTimerStartedAt(new Date())}
                onStop={handleTimerStop}
                onReset={() => setTimerStartedAt(null)}
              />
              <div className="text-center">
                <span className="text-text-muted text-xs">or enter minutes manually:</span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  placeholder="e.g. 20"
                  value={durationMinutes ?? ''}
                  onChange={(e) =>
                    setDurationMinutes(e.target.value ? Number(e.target.value) : null)
                  }
                  className="mt-1 block mx-auto w-32 text-center bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <div className="text-text-muted text-xs uppercase tracking-wide">Duration</div>
              <div className="font-serif text-3xl text-accent my-1">
                {durationMinutes} min
              </div>
              <button
                type="button"
                onClick={() => setDurationMinutes(null)}
                className="text-xs text-text-muted underline hover:text-text"
              >
                Change or re-time
              </button>
            </div>
          )
        ) : (
          <div>
            <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
              Repetitions
            </label>
            <input
              type="number"
              min="1"
              max="100000"
              placeholder="e.g. 25"
              value={reps ?? ''}
              onChange={(e) => setReps(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-surface-2 rounded-xl px-4 py-3 text-text text-lg text-center border border-border focus:border-accent outline-none font-serif"
            />
          </div>
        )}

        {/* Rating picker */}
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
            Rating <span className="text-accent">*</span>
          </div>
          {ratingStyle === 'emoji' ? (
            <RatingPicker value={rating} onChange={setRating} />
          ) : ratingStyle === 'dots' ? (
            <DotsRatingPicker value={rating} onChange={setRating} />
          ) : (
            <SliderRatingPicker value={rating} onChange={setRating} />
          )}
        </div>

        {/* Multi-dimensional sliders */}
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="text-xs uppercase tracking-wide text-text-muted">
            State (optional)
          </div>
          <MultiDimSlider
            dimension="focus"
            value={focusRating}
            onChange={setFocusRating}
          />
          <MultiDimSlider
            dimension="energy"
            value={energyRating}
            onChange={setEnergyRating}
          />
          <MultiDimSlider
            dimension="mood"
            value={moodRating}
            onChange={setMoodRating}
          />
        </div>

        {/* Activity label */}
        <div>
          <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Activity label (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. meditation, kata, deep work"
            value={activityLabel}
            onChange={(e) => setActivityLabel(e.target.value)}
            maxLength={50}
            className="w-full bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none"
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Notes (optional)
          </label>
          <textarea
            placeholder="What did you practice? How was your form?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none resize-none"
          />
        </div>

        {error && <p className="text-sm text-hype">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1">
            Save session
          </Button>
        </div>
      </form>
    </Modal>
  );
}
