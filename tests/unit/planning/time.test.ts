import { describe, it, expect } from 'vitest';
import {
  elapsedMinutes,
  epochToLocalClock,
  localDayEnd,
  localDayStart,
  localWallClockToEpoch,
  localWeekday,
  parseClockTime,
  parseDayKey,
  wakingWindow,
} from '@/lib/planning/time';

/**
 * The four daylight-saving days the roadmap names: the spring-forward and
 * fall-back mornings in America/Los_Angeles and Europe/Helsinki.
 *
 * The assertions are written so they hold in **every** timezone: the test
 * first asks the day how long it actually is, and then checks the behaviour
 * that follows. Run under TZ=America/Los_Angeles the LA days have a
 * transition and the Helsinki days do not; under TZ=Europe/Helsinki it is the
 * other way round.
 */
const DST_DAYS = ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25'];

function dayLengthMinutes(day: string): number {
  return elapsedMinutes(localDayStart(day), localDayEnd(day));
}

/** The offset (minutes west of UTC) at an instant. */
function offsetAt(epochMs: number): number {
  return new Date(epochMs).getTimezoneOffset();
}

/** Find the transition inside a day, if there is one. */
function findTransition(day: string): { atMs: number; gapMin: number } | null {
  let previous = localWallClockToEpoch(day, '00:00');
  for (let hour = 1; hour <= 24; hour++) {
    const clock = `${String(hour % 24).padStart(2, '0')}:00`;
    const at = localWallClockToEpoch(day, clock);
    const before = offsetAt(previous);
    const after = offsetAt(at);
    if (before !== after) {
      // The transition happened between the two probes: narrow it down.
      let low = previous;
      let high = at;
      while (high - low > 1000) {
        const mid = low + Math.floor((high - low) / 2);
        if (offsetAt(mid) === before) low = mid;
        else high = mid;
      }
      return { atMs: high, gapMin: Math.abs(after - before) };
    }
    previous = at;
  }
  return null;
}

describe('day keys and clock times', () => {
  it('parses and rejects bad input', () => {
    expect(parseDayKey('2026-03-08')).toEqual({ y: 2026, m: 3, d: 8 });
    expect(() => parseDayKey('2026-3-8')).toThrow();
    expect(parseClockTime('07:30')).toEqual({ hh: 7, mm: 30 });
    expect(() => parseClockTime('7:30')).toThrow();
    expect(() => parseClockTime('24:00')).toThrow();
  });

  it('knows the weekday of a local day', () => {
    expect(localWeekday('2026-03-08')).toBe(0); // Sunday
    expect(localWeekday('2026-03-09')).toBe(1); // Monday
  });
});

describe('local wall-clock times', () => {
  it('round-trips an ordinary time', () => {
    const epoch = localWallClockToEpoch('2026-06-15', '09:30');
    expect(epochToLocalClock(epoch)).toEqual({ dayKey: '2026-06-15', clock: '09:30' });
  });

  it.each(DST_DAYS)('resolves times consistently on %s', (day) => {
    const length = dayLengthMinutes(day);
    const transition = findTransition(day);

    if (length === 1440) {
      // No transition on this day in this timezone: every time round-trips.
      expect(transition).toBeNull();
      const epoch = localWallClockToEpoch(day, '09:30');
      expect(epochToLocalClock(epoch)).toEqual({ dayKey: day, clock: '09:30' });
      return;
    }

    expect(transition).not.toBeNull();
    const { atMs, gapMin } = transition!;

    if (length < 1440) {
      // The clock jumps forward: a time inside the gap does not exist.
      // The gap is the hour before the local clock the transition lands on.
      const transitionLocal = epochToLocalClock(atMs);
      const [tH, tM] = transitionLocal.clock.split(':').map(Number);
      const gapStartMinute = tH! * 60 + tM! - gapMin;
      const insideMinute = gapStartMinute + 30;
      const insideClock = `${String(Math.floor(insideMinute / 60)).padStart(2, '0')}:${String(insideMinute % 60).padStart(2, '0')}`;

      const resolved = localWallClockToEpoch(day, insideClock);
      const resolvedLocal = epochToLocalClock(resolved);

      // The policy: shift forward by the gap.
      const expectedMinute = insideMinute + gapMin;
      expect(resolvedLocal.clock).toBe(
        `${String(Math.floor(expectedMinute / 60)).padStart(2, '0')}:${String(expectedMinute % 60).padStart(2, '0')}`,
      );
      // And it agrees with the platform's own calendar arithmetic.
      const { y, m, d } = parseDayKey(day);
      const [hh, mm] = insideClock.split(':').map(Number);
      expect(resolved).toBe(new Date(y, m - 1, d, hh!, mm!).getTime());
      return;
    }

    // The clock falls back: a time inside the repeated hour happens twice.
    const repeatedStartLocal = epochToLocalClock(atMs);
    const [repH, repM] = repeatedStartLocal.clock.split(':').map(Number);
    const insideMinute = (repH! * 60 + repM!) + 30;
    const insideClock = `${String(Math.floor(insideMinute / 60)).padStart(2, '0')}:${String(insideMinute % 60).padStart(2, '0')}`;

    const resolved = localWallClockToEpoch(day, insideClock);
    // The policy: the first of the two occurrences, so the earlier instant.
    const { y, m, d } = parseDayKey(day);
    const [hh, mm] = insideClock.split(':').map(Number);
    expect(resolved).toBe(new Date(y, m - 1, d, hh!, mm!).getTime());
    expect(epochToLocalClock(resolved).clock).toBe(insideClock);
  });

  it('measures a day by its real elapsed time', () => {
    // An ordinary day is 24 hours of minutes.
    expect(dayLengthMinutes('2026-06-15')).toBe(1440);
  });
});

describe('the waking window', () => {
  it('is a same-day window when the end is after the start', () => {
    const window = wakingWindow('2026-06-15', { start: '07:00', end: '22:00' });
    expect(elapsedMinutes(window.start, window.end)).toBe(900);
  });

  it('runs into the next morning when the end is before the start', () => {
    const window = wakingWindow('2026-06-15', { start: '22:00', end: '07:00' });
    expect(elapsedMinutes(window.start, window.end)).toBe(540);
    // The window belongs to the day it starts on.
    expect(epochToLocalClock(window.start).dayKey).toBe('2026-06-15');
    expect(epochToLocalClock(window.end).dayKey).toBe('2026-06-16');
  });
});
