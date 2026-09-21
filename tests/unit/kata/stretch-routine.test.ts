import { describe, expect, it } from 'vitest';
import {
  buildStretchRoutine,
  createStretchPlayer,
  formatHoldClock,
  formatStretchSessionNote,
  routineDurationMinutes,
  stepStretchPlayer,
  type StretchPlayerState,
} from '@/lib/kata/stretch-routine';

const FIGURE_FOUR_NAMES = [
  'Pancake',
  'Figure four · Left',
  'Figure four · Right',
  'Stable forward lunge with a gentle backward arch · Left',
  'Stable forward lunge with a gentle backward arch · Right',
  'Bar/strap chest opener',
  'Lat stretch',
];

const HALF_PIGEON_NAMES = [
  'Pancake',
  'Half pigeon · Left',
  'Half pigeon · Right',
  'Stable forward lunge with a gentle backward arch · Left',
  'Stable forward lunge with a gentle backward arch · Right',
  'Bar/strap chest opener',
  'Lat stretch',
];

function flags(state: StretchPlayerState) {
  return { holdJustStarted: state.holdJustStarted, holdJustFinished: state.holdJustFinished };
}

describe('buildStretchRoutine', () => {
  it('builds seven 30-second holds totaling 3.5 minutes for both hip choices', () => {
    for (const hip of ['figure-four', 'half-pigeon'] as const) {
      const holds = buildStretchRoutine(hip);
      expect(holds).toHaveLength(7);
      expect(holds.every((hold) => hold.seconds === 30)).toBe(true);
      expect(holds.some((hold) => hold.seconds === 15)).toBe(false);
      expect(holds.reduce((sum, hold) => sum + hold.seconds, 0)).toBe(210);
      expect(routineDurationMinutes(holds)).toBe(3.5);
    }
  });

  it('names holds in order, with the hip choice on both sides and Lat stretch last', () => {
    expect(buildStretchRoutine('figure-four').map((hold) => hold.name)).toEqual(FIGURE_FOUR_NAMES);
    expect(buildStretchRoutine('half-pigeon').map((hold) => hold.name)).toEqual(HALF_PIGEON_NAMES);
    const cues = [
      ...buildStretchRoutine('figure-four'),
      ...buildStretchRoutine('half-pigeon'),
    ].map((hold) => `${hold.name}\n${hold.cue}`);
    expect(cues.join('\n')).not.toMatch(/countertop prayer stretch|butcher|shaka|feet elevated|progression/i);
  });

  it('describes the elbows-supported lat stretch and no further progressions', () => {
    const lat = buildStretchRoutine('figure-four').at(-1);
    expect(lat).toMatchObject({
      name: 'Lat stretch',
      seconds: 30,
      cue: 'Elbows on a secure countertop, prayer hands, head and chest lowering between the arms, feet on the floor.',
    });
    expect(lat?.cue.toLowerCase()).not.toMatch(/elevat|shaka|butcher|progression/);
  });

  it('lists every hold in the saved note', () => {
    const holds = buildStretchRoutine('half-pigeon');
    const note = formatStretchSessionNote(holds);
    expect(note.split('\n')).toEqual(holds.map((hold) => `${hold.name}: 30s`));
    expect(note).toContain('Half pigeon · Left: 30s');
    expect(note).toContain('Half pigeon · Right: 30s');
    expect(note).toContain('Lat stretch: 30s');
    expect(note.length).toBeLessThanOrEqual(2000);
    expect(note).not.toContain('15s');
  });
});

describe('formatHoldClock', () => {
  it('ceils remaining milliseconds to MM:SS and shows 00:00 at zero', () => {
    expect(formatHoldClock(30_000)).toBe('00:30');
    expect(formatHoldClock(29_001)).toBe('00:30');
    expect(formatHoldClock(29_000)).toBe('00:29');
    expect(formatHoldClock(1)).toBe('00:01');
    expect(formatHoldClock(0)).toBe('00:00');
  });
});

describe('stretch player', () => {
  const holds = buildStretchRoutine('figure-four');

  it('starts ready at 30 seconds', () => {
    const state = createStretchPlayer(holds);
    expect(state).toMatchObject({
      index: 0,
      phase: 'ready',
      remainingMs: 30_000,
      startedAtMs: null,
      endedAtMs: null,
      holdJustStarted: false,
      holdJustFinished: false,
    });
  });

  it('counts down from an absolute deadline and finishes the hold once', () => {
    let state = stepStretchPlayer(createStretchPlayer(holds), { type: 'start', nowMs: 0 });
    expect(state.phase).toBe('running');
    expect(state.remainingMs).toBe(30_000);
    expect(state.deadlineMs).toBe(30_000);
    expect(state.startedAtMs).toBe(0);
    expect(state.holdJustStarted).toBe(true);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 29_999 });
    expect(state.phase).toBe('running');
    expect(state.remainingMs).toBe(1);
    expect(state.holdJustFinished).toBe(false);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 30_000 });
    expect(state.phase).toBe('between');
    expect(state.remainingMs).toBe(0);
    expect(state.holdJustFinished).toBe(true);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 30_100 });
    expect(state.phase).toBe('between');
    expect(state.holdJustFinished).toBe(false);
    expect(flags(state)).toEqual({ holdJustStarted: false, holdJustFinished: false });
  });

  it('excludes paused time from the hold', () => {
    let state = stepStretchPlayer(createStretchPlayer(holds), { type: 'start', nowMs: 0 });
    state = stepStretchPlayer(state, { type: 'pause', nowMs: 10_000 });
    expect(state.phase).toBe('paused');
    expect(state.remainingMs).toBe(20_000);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 30_000 });
    expect(state.phase).toBe('paused');
    expect(state.remainingMs).toBe(20_000);
    expect(state.holdJustFinished).toBe(false);

    state = stepStretchPlayer(state, { type: 'start', nowMs: 50_000 });
    expect(state.phase).toBe('running');
    expect(state.holdJustStarted).toBe(false);
    expect(state.startedAtMs).toBe(0);
    expect(state.deadlineMs).toBe(70_000);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 69_999 });
    expect(state.phase).toBe('running');
    expect(state.remainingMs).toBe(1);

    state = stepStretchPlayer(state, { type: 'tick', nowMs: 70_000 });
    expect(state.phase).toBe('between');
    expect(state.holdJustFinished).toBe(true);
  });

  it('finishes the hold when pause lands on an already elapsed deadline', () => {
    let state = stepStretchPlayer(createStretchPlayer(holds), { type: 'start', nowMs: 0 });
    state = stepStretchPlayer(state, { type: 'pause', nowMs: 30_000 });
    expect(state.phase).toBe('between');
    expect(state.remainingMs).toBe(0);
    expect(state.holdJustFinished).toBe(true);
  });

  it('does not auto-run the next hold and finishes only after the seventh', () => {
    let state = createStretchPlayer(holds);
    let now = 0;
    for (let index = 0; index < holds.length; index += 1) {
      state = stepStretchPlayer(state, { type: 'start', nowMs: now });
      expect(state.phase).toBe('running');
      now += 30_000;
      state = stepStretchPlayer(state, { type: 'tick', nowMs: now });
      expect(state.phase).toBe('between');
      expect(state.index).toBe(index);
      state = stepStretchPlayer(state, { type: 'advance', nowMs: now + 5_000 });
      now += 5_000;
      if (index < holds.length - 1) {
        expect(state.phase).toBe('ready');
        expect(state.index).toBe(index + 1);
        expect(state.remainingMs).toBe(30_000);
        expect(state.holdJustStarted).toBe(false);
      }
    }
    expect(state.phase).toBe('done');
    expect(state.startedAtMs).toBe(0);
    expect(state.endedAtMs).toBe(now);
    expect(state.endedAtMs! - state.startedAtMs!).toBe(30_000 * 7 + 5_000 * 7);
    expect(routineDurationMinutes(holds)).toBe(3.5);
  });

  it('ignores illegal transitions', () => {
    const ready = createStretchPlayer(holds);
    expect(stepStretchPlayer(ready, { type: 'pause', nowMs: 0 }).phase).toBe('ready');
    expect(stepStretchPlayer(ready, { type: 'advance', nowMs: 0 }).phase).toBe('ready');
    expect(stepStretchPlayer(ready, { type: 'tick', nowMs: 1_000 })).toMatchObject({
      phase: 'ready',
      remainingMs: 30_000,
      holdJustStarted: false,
      holdJustFinished: false,
    });

    const running = stepStretchPlayer(ready, { type: 'start', nowMs: 0 });
    const restarted = stepStretchPlayer(running, { type: 'start', nowMs: 1_000 });
    expect(restarted.phase).toBe('running');
    expect(restarted.deadlineMs).toBe(running.deadlineMs);
    expect(flags(restarted)).toEqual({ holdJustStarted: false, holdJustFinished: false });

    const between = stepStretchPlayer(running, { type: 'tick', nowMs: 30_000 });
    expect(between.holdJustFinished).toBe(true);
    const pausedBetween = stepStretchPlayer(between, { type: 'pause', nowMs: 30_000 });
    expect(pausedBetween.phase).toBe('between');
    expect(flags(pausedBetween)).toEqual({ holdJustStarted: false, holdJustFinished: false });

    const nextReady = stepStretchPlayer(between, { type: 'advance', nowMs: 40_000 });
    expect(nextReady.phase).toBe('ready');
    expect(nextReady.index).toBe(1);
    expect(stepStretchPlayer(nextReady, { type: 'advance', nowMs: 50_000 })).toMatchObject({
      phase: 'ready',
      index: 1,
      holdJustStarted: false,
      holdJustFinished: false,
    });

    let done = between;
    let cursor = 30_000;
    for (let index = 1; index < holds.length; index += 1) {
      done = stepStretchPlayer(done, { type: 'advance', nowMs: cursor });
      done = stepStretchPlayer(done, { type: 'start', nowMs: cursor });
      cursor += 30_000;
      done = stepStretchPlayer(done, { type: 'tick', nowMs: cursor });
    }
    done = stepStretchPlayer(done, { type: 'advance', nowMs: cursor });
    expect(done.phase).toBe('done');
    expect(done.endedAtMs).toBe(cursor);
    expect(stepStretchPlayer(done, { type: 'start', nowMs: cursor + 1_000 })).toMatchObject({
      phase: 'done',
      endedAtMs: cursor,
      holdJustStarted: false,
      holdJustFinished: false,
    });
  });
});
