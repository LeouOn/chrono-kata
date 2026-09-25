'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RatingControl } from './RatingControl';
import { MultiDimSlider } from './MultiDimSlider';
import { Timer } from './Timer';
import { useSettings } from '@/hooks/useSettings';
import { useSessions } from '@/hooks/useSessions';
import { useKataTemplates } from '@/hooks/useKataTemplates';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { suggestLabel } from '@/lib/llm/llm-service';
import { buildLabelSuggestions } from '@/lib/utils/labels';
import { toDateTimeLocalValue } from '@/lib/utils/date';
import { dispatchToast } from '@/components/ui/Toast';
import { playIntervalPing } from '@/lib/audio/bell-synthesizer';
import { cancelCapNotification, scheduleCapNotification } from '@/lib/timers/cap-notification';
import { readSessionTimer, stoppedAtCap, writeSessionTimer, type SessionTimerDraft } from '@/lib/timers/session-timer';
import { pauseHabitTimer } from '@/lib/timers/habit-timer';
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
  const ratingStyle = settings?.ratingStyle ?? 'stars';
  const { sessions } = useSessions();
  const { templates } = useKataTemplates();
  const { settings: llmSettings, configuredProviderNames } = useLLMSettings();
  const [suggesting, setSuggesting] = useState(false);
  const [mode, setMode] = useState<Mode>(
    initial?.durationMinutes != null
      ? 'timed'
      : initial?.reps != null
        ? 'reps'
        : initialTemplate?.mode ?? 'timed'
  );
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [timerStoppedUnsaved, setTimerStoppedUnsaved] = useState(false);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [startedAtTouched, setStartedAtTouched] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
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
  const [softCapMinutes, setSoftCapMinutes] = useState<number | null>(
    initialTemplate?.softCapMinutes ?? null,
  );
  const [templateId, setTemplateId] = useState<string | null>(
    initial?.kataTemplateId ?? initialTemplate?.id ?? null,
  );
  const [capPromptShown, setCapPromptShown] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelSuggestions = useMemo(
    () => buildLabelSuggestions(sessions, templates, activityLabel),
    [sessions, templates, activityLabel]
  );
  const canSuggest =
    note.trim().length > 0 && configuredProviderNames.length > 0 && !suggesting;

  useEffect(() => {
    if (!open) return;
    const draft = !initial && !initialTemplate ? readSessionTimer() : null;
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
      setStartedAt(initial.startedAt);
      setSoftCapMinutes(null);
      setTemplateId(initial.kataTemplateId ?? null);
      setTimerStartedAt(null);
    } else if (draft) {
      applyDraft(draft);
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
      setStartedAt(new Date());
      setSoftCapMinutes(initialTemplate.softCapMinutes ?? null);
      setTemplateId(initialTemplate.id);
      setTimerStartedAt(null);
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
      setStartedAt(new Date());
      setSoftCapMinutes(null);
      setTemplateId(null);
      setTimerStartedAt(null);
    }
    if (!draft) {
      setCapPromptShown(false);
      setKeepGoing(false);
    }
    setTimerStoppedUnsaved(false);
    setStartedAtTouched(Boolean(draft));
    setConfirmDiscardOpen(false);
    setError(null);
  }, [open, initial, initialTemplate]);

  function applyDraft(draft: SessionTimerDraft) {
    setMode(draft.mode);
    setDurationMinutes(draft.durationMinutes);
    setReps(draft.reps);
    setActivityLabel(draft.activityLabel);
    setNote(draft.note);
    setStartedAt(new Date(draft.startedAtMs));
    setSoftCapMinutes(draft.softCapMinutes);
    setCapPromptShown(draft.capPromptShown);
    setKeepGoing(draft.keepGoing);
    setTemplateId(draft.templateId);
    setTimerStartedAt(new Date(draft.startedAtMs));
    if (draft.softCapMinutes != null) {
      void scheduleCapNotification(new Date(draft.startedAtMs + draft.softCapMinutes * 60_000));
    }
  }

  function handleTimerStart() {
    void pauseHabitTimer();
    const now = new Date();
    const cap = softCapMinutes;
    setTimerStartedAt(now);
    setTimerStoppedUnsaved(false);
    setStartedAt(now);
    setStartedAtTouched(true);
    setCapPromptShown(false);
    setKeepGoing(false);
    writeSessionTimer({
      startedAtMs: now.getTime(),
      mode,
      durationMinutes,
      reps,
      activityLabel,
      note,
      templateId,
      softCapMinutes: cap,
      capPromptShown: false,
      keepGoing: false,
    });
    if (cap != null) void scheduleCapNotification(new Date(now.getTime() + cap * 60_000));
  }

  function requestClose() {
    if (confirmDiscardOpen) return;
    if (timerStartedAt != null || timerStoppedUnsaved) {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  }

  function handleTimerStop(minutes: number) {
    setDurationMinutes(minutes);
    setTimerStartedAt(null);
    setTimerStoppedUnsaved(true);
    if (mode !== 'timed') setMode('timed');
    writeSessionTimer(null);
    void cancelCapNotification();
  }

  useEffect(() => {
    if (!open || initial || !timerStartedAt) return;
    writeSessionTimer({
      startedAtMs: timerStartedAt.getTime(),
      mode,
      durationMinutes,
      reps,
      activityLabel,
      note,
      templateId,
      softCapMinutes,
      capPromptShown,
      keepGoing,
    });
  }, [
    open,
    initial,
    timerStartedAt,
    mode,
    durationMinutes,
    reps,
    activityLabel,
    note,
    templateId,
    softCapMinutes,
    capPromptShown,
    keepGoing,
  ]);

  useEffect(() => {
    if (!timerStartedAt || softCapMinutes == null || keepGoing || capPromptShown) return;
    const fire = () => {
      setCapPromptShown(true);
      playIntervalPing({ volume: 0.7 });
    };
    const elapsed = Date.now() - timerStartedAt.getTime();
    if (elapsed >= softCapMinutes * 60_000) {
      fire();
      return;
    }
    const id = window.setTimeout(fire, softCapMinutes * 60_000 - elapsed);
    return () => window.clearTimeout(id);
  }, [timerStartedAt, softCapMinutes, keepGoing, capPromptShown]);

  async function handleSuggest() {
    if (!llmSettings || suggesting) return;
    setSuggesting(true);
    try {
      const label = await suggestLabel({ note, llmSettings });
      if (label) setActivityLabel(label.slice(0, 50));
    } catch (e) {
      dispatchToast(
        e instanceof Error ? e.message : 'Label suggestion failed',
        'error'
      );
    } finally {
      setSuggesting(false);
    }
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

    const effectiveStartedAt =
      startedAtTouched || initial != null ? startedAt : new Date();
    const input: SessionInput = {
      startedAt: effectiveStartedAt,
      endedAt:
        mode === 'timed' && durationMinutes != null
          ? new Date(effectiveStartedAt.getTime() + durationMinutes * 60_000)
          : null,
      durationMinutes: mode === 'timed' ? durationMinutes : null,
      reps: mode === 'reps' ? reps : null,
      rating,
      activityLabel: activityLabel.trim() || undefined,
      note: note.trim() || undefined,
      kataTemplateId: templateId,
      focusRating,
      energyRating,
      moodRating,
      stoppedAtCap: stoppedAtCap({
        softCapMinutes,
        elapsedMinutes: mode === 'timed' ? durationMinutes : null,
        promptShown: capPromptShown,
      }) || undefined,
    };
    writeSessionTimer(null);
    void cancelCapNotification();
    onSave(input);
  }

  return (
    <>
      <Modal open={open} onClose={requestClose} title={initial ? 'Edit session' : initialTemplate ? `Start ${initialTemplate.name}` : 'New session'}>
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
                onStart={handleTimerStart}
                onStop={handleTimerStop}
                onReset={() => {
                  setTimerStartedAt(null);
                  writeSessionTimer(null);
                  void cancelCapNotification();
                }}
              />
              <div className="text-center">
                <span className="text-text-muted text-xs">or enter minutes manually:</span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  step="any"
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

        {capPromptShown && !keepGoing && timerStartedAt && (
          <div role="status" className="rounded-2xl border border-accent/40 bg-accent/10 p-4 space-y-3">
            <p className="text-sm text-text">That's your cap for today. A good place to stop.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                onClick={() => {
                  if (softCapMinutes != null) handleTimerStop(softCapMinutes);
                  setKeepGoing(false);
                }}
              >
                Stop here
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setKeepGoing(true)}>
                Keep going
              </Button>
            </div>
          </div>
        )}

        {/* When */}
        <div>
          <label
            htmlFor="session-started-at"
            className="text-xs uppercase tracking-wide text-text-muted block mb-1"
          >
            When
          </label>
          <input
            id="session-started-at"
            type="datetime-local"
            value={toDateTimeLocalValue(startedAt)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!Number.isNaN(d.getTime())) {
                setStartedAt(d);
                setStartedAtTouched(true);
              }
            }}
            className="w-full bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none"
          />
        </div>

        {/* Rating picker */}
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
            Rating <span className="text-accent">*</span>
          </div>
          <RatingControl value={rating} onChange={setRating} style={ratingStyle} />
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
            emoji={ratingStyle === 'emoji'}
          />
          <MultiDimSlider
            dimension="energy"
            value={energyRating}
            onChange={setEnergyRating}
            emoji={ratingStyle === 'emoji'}
          />
          <MultiDimSlider
            dimension="mood"
            value={moodRating}
            onChange={setMoodRating}
            emoji={ratingStyle === 'emoji'}
          />
        </div>

        {/* Activity label */}
        <div>
          <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Activity label (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. meditation, kata, deep work"
              value={activityLabel}
              onChange={(e) => setActivityLabel(e.target.value)}
              maxLength={50}
              className="flex-1 bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSuggest()}
              disabled={!canSuggest}
              title={
                configuredProviderNames.length === 0
                  ? 'Configure an LLM provider to suggest labels'
                  : 'Suggest a label from your note'
              }
              aria-label="Suggest activity label"
              className="flex-shrink-0 w-10 rounded-xl bg-surface-2 border border-border text-text-muted hover:text-accent hover:border-accent/40 disabled:opacity-30 disabled:hover:text-text-muted disabled:hover:border-border transition-colors flex items-center justify-center"
            >
              <Sparkles size={15} className={suggesting ? 'animate-pulse' : ''} />
            </button>
          </div>
          {labelSuggestions.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {labelSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActivityLabel(s)}
                  className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-text-muted hover:text-text border border-border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
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
          <Button type="button" variant="ghost" onClick={requestClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1">
            Save session
          </Button>
        </div>
      </form>
      </Modal>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard unsaved practice?"
        message="A timed practice hasn't been saved yet. Closing the form now will discard the measured time."
        confirmLabel="Discard practice"
        cancelLabel="Keep editing"
        layer={2}
        onConfirm={() => {
          writeSessionTimer(null);
          void cancelCapNotification();
          setConfirmDiscardOpen(false);
          onCancel();
        }}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </>
  );
}
