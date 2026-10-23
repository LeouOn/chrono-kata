import { afterEach, describe, expect, it } from 'vitest';
import { readSessionTimer, stoppedAtCap, writeSessionTimer } from '@/lib/timers/session-timer';

afterEach(() => {
  localStorage.clear();
});

describe('session timer storage', () => {
  it('restores the task/project link added by Wave 9', () => {
    writeSessionTimer({
      startedAtMs: 1_700_000_000_000,
      mode: 'timed',
      durationMinutes: 20,
      reps: null,
      activityLabel: 'report',
      note: '',
      templateId: null,
      softCapMinutes: null,
      capPromptShown: false,
      keepGoing: false,
      taskId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
    });
    const draft = readSessionTimer();
    expect(draft?.taskId).toBe('11111111-1111-4111-8111-111111111111');
    expect(draft?.projectId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('restores an old draft without the link fields as unlinked', () => {
    localStorage.setItem(
      'chrono-kata-session-timer',
      JSON.stringify({
        startedAtMs: 1_700_000_000_000,
        mode: 'timed',
        durationMinutes: 15,
        reps: null,
        activityLabel: 'old draft',
        note: '',
        templateId: null,
        softCapMinutes: null,
        capPromptShown: false,
        keepGoing: false,
      }),
    );
    const draft = readSessionTimer();
    expect(draft?.activityLabel).toBe('old draft');
    expect(draft?.taskId).toBeNull();
    expect(draft?.projectId).toBeNull();
  });

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
      taskId: null,
      projectId: null,
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
