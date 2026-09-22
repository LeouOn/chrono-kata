'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { RatingControl } from '@/components/session/RatingControl';
import { useSettings } from '@/hooks/useSettings';
import { playIntervalPing } from '@/lib/audio/bell-synthesizer';
import {
  buildStretchRoutine,
  createStretchPlayer,
  formatHoldClock,
  formatStretchSessionNote,
  routineDurationMinutes,
  stepStretchPlayer,
  type HipChoice,
  type StretchPlayerEvent,
  type StretchPlayerState,
} from '@/lib/kata/stretch-routine';
import type { Rating, SessionInput } from '@/lib/schemas/session';

const primaryButtonClass =
  'rounded-full bg-accent text-base px-5 py-2.5 font-medium disabled:opacity-40';

export function StretchRoutine({ onSave }: { onSave: (input: SessionInput) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-border bg-surface p-4 text-left hover:border-accent/40"
      >
        <span className="block font-serif text-lg text-text">Daily stretches</span>
        <span className="mt-1 block text-sm text-text-muted">
          7 holds · 3½ minutes · 30 seconds each
        </span>
      </button>
      {open && <StretchPlayer onClose={() => setOpen(false)} onSave={onSave} />}
    </>
  );
}

function StretchPlayer({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: SessionInput) => Promise<unknown>;
}) {
  const [hip, setHip] = useState<HipChoice>('figure-four');
  const [sound, setSound] = useState(true);
  const [stage, setStage] = useState<'preview' | 'active'>('preview');
  const [player, setPlayer] = useState<StretchPlayerState | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const playerRef = useRef<StretchPlayerState | null>(null);
  const soundRef = useRef(sound);
  const saveInFlight = useRef(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<(event: StretchPlayerEvent) => void>(() => {});
  soundRef.current = sound;

  function commit(next: StretchPlayerState) {
    playerRef.current = next;
    if (soundRef.current && next.holdJustStarted) playIntervalPing();
    else if (soundRef.current && next.holdJustFinished) playIntervalPing();
    setPlayer(next);
  }

  function apply(event: StretchPlayerEvent) {
    const current = playerRef.current;
    if (!current) return;
    commit(stepStretchPlayer(current, event));
  }
  applyRef.current = apply;

  const viewKey = confirmExit
    ? 'confirm'
    : stage === 'preview' || !player
      ? 'preview'
      : player.phase === 'done'
        ? 'done'
        : `${player.phase}:${player.index}`;

  useEffect(() => {
    const root = viewRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) return;
    root.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])')?.focus();
  }, [viewKey]);

  useEffect(() => {
    if (player?.phase !== 'running') return;
    const timer = window.setInterval(() => {
      applyRef.current({ type: 'tick', nowMs: Date.now() });
    }, 100);
    return () => window.clearInterval(timer);
  }, [player?.phase]);

  function begin() {
    const next = createStretchPlayer(buildStretchRoutine(hip));
    playerRef.current = next;
    setPlayer(next);
    setStage('active');
  }

  function requestClose() {
    if (saveInFlight.current) return;
    const current = playerRef.current;
    if (!current || current.startedAtMs == null) {
      onClose();
      return;
    }
    if (current.phase === 'running') {
      commit(stepStretchPlayer(current, { type: 'pause', nowMs: Date.now() }));
    }
    setConfirmExit(true);
  }

  async function save() {
    const current = playerRef.current;
    if (
      saveInFlight.current ||
      !current ||
      rating == null ||
      current.startedAtMs == null ||
      current.endedAtMs == null
    ) {
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        startedAt: new Date(current.startedAtMs),
        endedAt: new Date(current.endedAtMs),
        durationMinutes: routineDurationMinutes(current.holds),
        reps: null,
        rating,
        activityLabel: 'Daily stretches',
        note: formatStretchSessionNote(current.holds),
      });
      onClose();
    } catch {
      saveInFlight.current = false;
      setSaving(false);
      setError('Could not save your stretches. Please try again.');
    }
  }

  const previewHolds = buildStretchRoutine(hip);

  return (
    <Modal open onClose={requestClose} title="Daily stretches">
      <div ref={viewRef} className="space-y-4">
        {confirmExit ? (
          <ExitConfirm onKeep={() => setConfirmExit(false)} onDiscard={onClose} />
        ) : stage === 'preview' || !player ? (
          <Preview
            hip={hip}
            sound={sound}
            holds={previewHolds}
            onHip={setHip}
            onToggleSound={() => setSound((on) => !on)}
            onBegin={begin}
            onClose={requestClose}
          />
        ) : player.phase === 'done' ? (
          <Completion
            minutes={routineDurationMinutes(player.holds)}
            rating={rating}
            saving={saving}
            error={error}
            onRating={setRating}
            onSave={() => void save()}
            onClose={requestClose}
          />
        ) : (
          <Player
            player={player}
            sound={sound}
            onToggleSound={() => setSound((on) => !on)}
            onPrimary={() => {
              const current = playerRef.current;
              if (!current) return;
              const nowMs = Date.now();
              if (current.phase === 'between') apply({ type: 'advance', nowMs });
              else if (current.phase === 'running') apply({ type: 'pause', nowMs });
              else apply({ type: 'start', nowMs });
            }}
            onClose={requestClose}
          />
        )}
      </div>
    </Modal>
  );
}

function Preview({
  hip,
  sound,
  holds,
  onHip,
  onToggleSound,
  onBegin,
  onClose,
}: {
  hip: HipChoice;
  sound: boolean;
  holds: ReturnType<typeof buildStretchRoutine>;
  onHip: (hip: HipChoice) => void;
  onToggleSound: () => void;
  onBegin: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        3½ minutes of holds, plus time to change position. Pauses and transitions are not counted.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm text-text">Hip stretch</legend>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="hip-stretch"
            value="figure-four"
            checked={hip === 'figure-four'}
            onChange={() => onHip('figure-four')}
          />
          Figure four
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="hip-stretch"
            value="half-pigeon"
            checked={hip === 'half-pigeon'}
            onChange={() => onHip('half-pigeon')}
          />
          Half pigeon
        </label>
      </fieldset>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
        {holds.map((hold) => (
          <li key={hold.name}>{hold.name}</li>
        ))}
      </ol>
      <p className="text-sm text-text-muted">
        Lat stretch uses elbows on a secure countertop, prayer hands, with your head and chest
        lowering between your arms and your feet on the floor. Other lat-stretch levels are not
        included.
      </p>
      <p className="text-sm text-text">
        Use a secure, stable support; ease in; stop if something hurts.
      </p>
      <button type="button" className={`${primaryButtonClass} w-full`} onClick={onBegin}>
        Begin
      </button>
      <div className="flex items-center justify-between gap-3">
        <SoundToggle on={sound} onToggle={onToggleSound} />
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-text">
          Close
        </button>
      </div>
    </div>
  );
}

function Player({
  player,
  sound,
  onToggleSound,
  onPrimary,
  onClose,
}: {
  player: StretchPlayerState;
  sound: boolean;
  onToggleSound: () => void;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const hold = player.holds[player.index];
  if (!hold) return null;
  const nextHold = player.holds[player.index + 1];
  const clock = formatHoldClock(player.remainingMs);
  const isLast = player.index === player.holds.length - 1;
  const status =
    player.phase === 'between'
      ? 'Hold complete. Take your time changing position.'
      : player.phase === 'paused'
        ? 'Paused.'
        : player.phase === 'running'
          ? 'Hold in progress.'
          : player.startedAtMs == null
            ? 'Ready. Start the hold when you are settled.'
            : 'Ready for the next hold.';
  const actionLabel =
    player.phase === 'between'
      ? isLast
        ? 'Finish routine'
        : 'Next stretch'
      : player.phase === 'running'
        ? 'Pause'
        : player.phase === 'paused'
          ? 'Resume'
          : 'Start hold';

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-center">
        <p className="text-xs text-text-muted">
          Hold {player.index + 1} of {player.holds.length}
        </p>
        <h3 className="font-serif text-xl text-text" aria-live="polite">
          {hold.name}
        </h3>
        <p className="text-sm text-text-muted">{hold.cue}</p>
        <div
          role="timer"
          aria-label={`${hold.name}, ${clock} remaining`}
          className="font-serif text-5xl text-accent tabular-nums"
        >
          {clock}
        </div>
        <p aria-live="polite" className="text-sm text-text">
          {status}
        </p>
        <button type="button" className={`${primaryButtonClass} w-full`} onClick={onPrimary}>
          {actionLabel}
        </button>
        <p className="text-xs text-text-muted">
          {nextHold ? `Next: ${nextHold.name}` : 'Last hold'}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <SoundToggle on={sound} onToggle={onToggleSound} />
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-text">
          Close
        </button>
      </div>
    </div>
  );
}

function Completion({
  minutes,
  rating,
  saving,
  error,
  onRating,
  onSave,
  onClose,
}: {
  minutes: number;
  rating: Rating | null;
  saving: boolean;
  error: string | null;
  onRating: (rating: Rating) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  return (
    <div className="space-y-4">
      <p role="status" className="text-text">
        Routine complete — lasted {minutes} minutes of stretching.
      </p>
      <p className="text-sm text-text-muted">How did it feel?</p>
      <RatingControl value={rating} onChange={onRating} style={settings?.ratingStyle ?? 'stars'} />
      {error && (
        <p role="alert" className="text-sm text-hype">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${primaryButtonClass} w-full`}
        disabled={rating == null || saving}
        onClick={onSave}
      >
        {saving ? 'Saving…' : 'Save stretches'}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-full px-4 py-2 text-sm text-text disabled:opacity-40"
      >
        Close
      </button>
    </div>
  );
}

function ExitConfirm({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-text">Leave without saving this routine?</p>
      <button type="button" className={`${primaryButtonClass} w-full`} onClick={onKeep}>
        Keep stretching
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="w-full rounded-full border border-border px-5 py-2.5 text-sm text-text"
      >
        Discard routine
      </button>
    </div>
  );
}

function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="rounded-full border border-border px-4 py-2 text-sm text-text"
    >
      Sound {on ? 'on' : 'off'}
    </button>
  );
}
