import { afterEach, describe, expect, it } from 'vitest';
import { readSessionTimer, stoppedAtCap, writeSessionTimer } from '@/lib/timers/session-timer';

afterEach(() => {
  localStorage.clear();
});

describe('session timer storage', () => {
  it('round-trips a running draft and clears it', () => {
    writeSessionTimer({
      startedAtMs: 1_700_000_000_000,
      mode: 'timed',
      durationMinutes: null,
      reps: null,
      activityLabel: 'Walk',
      note: 'easy',
      templateId: null,
      softCapMinutes: 20,
      capPromptShown: false,
      keepGoing: false,
    });
    expect(readSessionTimer()?.activityLabel).toBe('Walk');
    expect(readSessionTimer()?.softCapMinutes).toBe(20);
    writeSessionTimer(null);
    expect(readSessionTimer()).toBeNull();
  });

  it('rejects a corrupt draft', () => {
    localStorage.setItem('chrono-kata-session-timer', '{');
    expect(readSessionTimer()).toBeNull();
  });
});

describe('stoppedAtCap', () => {
  it('is true only within a minute of a shown cap', () => {
    expect(stoppedAtCap({ softCapMinutes: 20, elapsedMinutes: 20, promptShown: true })).toBe(true);
    expect(stoppedAtCap({ softCapMinutes: 20, elapsedMinutes: 21, promptShown: true })).toBe(true);
    expect(stoppedAtCap({ softCapMinutes: 20, elapsedMinutes: 19, promptShown: true })).toBe(true);
    expect(stoppedAtCap({ softCapMinutes: 20, elapsedMinutes: 22, promptShown: true })).toBe(false);
    expect(stoppedAtCap({ softCapMinutes: 20, elapsedMinutes: 20, promptShown: false })).toBe(false);
    expect(stoppedAtCap({ softCapMinutes: null, elapsedMinutes: 20, promptShown: true })).toBe(false);
  });
});
