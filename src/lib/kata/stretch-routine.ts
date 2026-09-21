export const HOLD_SECONDS = 30;
export const HOLD_MS = HOLD_SECONDS * 1000;

export type HipChoice = 'figure-four' | 'half-pigeon';

export interface StretchHold {
  name: string;
  cue: string;
  seconds: number;
}

export type StretchPhase = 'ready' | 'running' | 'paused' | 'between' | 'done';

export interface StretchPlayerState {
  holds: readonly StretchHold[];
  index: number;
  phase: StretchPhase;
  remainingMs: number;
  deadlineMs: number | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  holdJustStarted: boolean;
  holdJustFinished: boolean;
}

export type StretchPlayerEvent =
  | { type: 'tick'; nowMs: number }
  | { type: 'start'; nowMs: number }
  | { type: 'pause'; nowMs: number }
  | { type: 'advance'; nowMs: number };

function sideHolds(
  baseName: string,
  cueForSide: (side: 'Left' | 'Right') => string,
): StretchHold[] {
  return (['Left', 'Right'] as const).map((side) => ({
    name: `${baseName} · ${side}`,
    seconds: HOLD_SECONDS,
    cue: cueForSide(side),
  }));
}

export function buildStretchRoutine(hip: HipChoice): StretchHold[] {
  const hipName = hip === 'half-pigeon' ? 'Half pigeon' : 'Figure four';
  const hipCue = (side: 'Left' | 'Right') =>
    hip === 'half-pigeon'
      ? `${side} leg in front. From a stable position, support your hip as needed, and ease forward without forcing the front knee.`
      : `Lie on your back. Cross your ${side.toLowerCase()} ankle over the opposite thigh, and gently draw that thigh toward you.`;

  return [
    {
      name: 'Pancake',
      seconds: HOLD_SECONDS,
      cue: 'Sit in a comfortable straddle. Hinge forward from the hips without forcing depth.',
    },
    ...sideHolds(hipName, hipCue),
    ...sideHolds(
      'Stable forward lunge with a gentle backward arch',
      (side) =>
        `${side} foot forward in a stable lunge. Support yourself as needed, and gently lift the chest into a small backward arch.`,
    ),
    {
      name: 'Bar/strap chest opener',
      seconds: HOLD_SECONDS,
      cue: 'Unweighted bar or strap behind the shoulders, move it backward while extending the chest forward. Neck free, comfortable range.',
    },
    {
      name: 'Lat stretch',
      seconds: HOLD_SECONDS,
      cue: 'Elbows on a secure countertop, prayer hands, head and chest lowering between the arms, feet on the floor.',
    },
  ];
}

/** Hold total only. Pauses and position changes are not included. */
export function routineDurationMinutes(holds: readonly StretchHold[]): number {
  return holds.reduce((sum, hold) => sum + hold.seconds, 0) / 60;
}

export function formatStretchSessionNote(holds: readonly StretchHold[]): string {
  return holds.map((hold) => `${hold.name}: ${hold.seconds}s`).join('\n');
}

export function formatHoldClock(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createStretchPlayer(holds: readonly StretchHold[]): StretchPlayerState {
  const first = holds[0];
  return {
    holds,
    index: 0,
    phase: 'ready',
    remainingMs: first ? first.seconds * 1000 : HOLD_MS,
    deadlineMs: null,
    startedAtMs: null,
    endedAtMs: null,
    holdJustStarted: false,
    holdJustFinished: false,
  };
}

function clearFlags(state: StretchPlayerState): StretchPlayerState {
  if (!state.holdJustStarted && !state.holdJustFinished) return state;
  return { ...state, holdJustStarted: false, holdJustFinished: false };
}

export function stepStretchPlayer(
  state: StretchPlayerState,
  event: StretchPlayerEvent,
): StretchPlayerState {
  switch (event.type) {
    case 'start':
      return applyStart(state, event.nowMs);
    case 'pause':
      return applyPause(state, event.nowMs);
    case 'tick':
      return applyTick(state, event.nowMs);
    case 'advance':
      return applyAdvance(state, event.nowMs);
    default:
      return clearFlags(state);
  }
}

function applyStart(state: StretchPlayerState, nowMs: number): StretchPlayerState {
  if (state.phase === 'ready') {
    return {
      ...state,
      phase: 'running',
      deadlineMs: nowMs + state.remainingMs,
      startedAtMs: state.startedAtMs ?? nowMs,
      holdJustStarted: true,
      holdJustFinished: false,
    };
  }
  if (state.phase === 'paused') {
    return {
      ...state,
      phase: 'running',
      deadlineMs: nowMs + state.remainingMs,
      holdJustStarted: false,
      holdJustFinished: false,
    };
  }
  return clearFlags(state);
}

function applyPause(state: StretchPlayerState, nowMs: number): StretchPlayerState {
  if (state.phase !== 'running' || state.deadlineMs == null) return clearFlags(state);
  const remainingMs = state.deadlineMs - nowMs;
  if (remainingMs <= 0) {
    return {
      ...state,
      phase: 'between',
      remainingMs: 0,
      deadlineMs: null,
      holdJustStarted: false,
      holdJustFinished: true,
    };
  }
  return {
    ...state,
    phase: 'paused',
    remainingMs,
    deadlineMs: null,
    holdJustStarted: false,
    holdJustFinished: false,
  };
}

function applyTick(state: StretchPlayerState, nowMs: number): StretchPlayerState {
  if (state.phase !== 'running' || state.deadlineMs == null) return clearFlags(state);
  const remainingMs = state.deadlineMs - nowMs;
  if (remainingMs <= 0) {
    return {
      ...state,
      phase: 'between',
      remainingMs: 0,
      deadlineMs: null,
      holdJustStarted: false,
      holdJustFinished: true,
    };
  }
  return {
    ...state,
    remainingMs,
    holdJustStarted: false,
    holdJustFinished: false,
  };
}

function applyAdvance(state: StretchPlayerState, nowMs: number): StretchPlayerState {
  if (state.phase !== 'between') return clearFlags(state);
  const nextIndex = state.index + 1;
  if (nextIndex >= state.holds.length) {
    return {
      ...state,
      phase: 'done',
      remainingMs: 0,
      deadlineMs: null,
      endedAtMs: nowMs,
      holdJustStarted: false,
      holdJustFinished: false,
    };
  }
  const next = state.holds[nextIndex];
  return {
    ...state,
    index: nextIndex,
    phase: 'ready',
    remainingMs: next ? next.seconds * 1000 : HOLD_MS,
    deadlineMs: null,
    holdJustStarted: false,
    holdJustFinished: false,
  };
}
