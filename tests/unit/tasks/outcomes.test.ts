import { describe, expect, it } from 'vitest';
import {
  INBOX_OUTCOMES,
  outcomeForKey,
  outcomeTransition,
  UNDO_STATUS,
} from '@/lib/tasks/outcomes';
import { canTransition } from '@/lib/tasks/transitions';

describe('inbox outcomes', () => {
  it('maps keys 1-6 in order', () => {
    expect(INBOX_OUTCOMES.map((spec) => spec.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(INBOX_OUTCOMES.map((spec) => spec.outcome)).toEqual([
      'do-now',
      'next-action',
      'schedule',
      'waiting',
      'drop',
      'make-project',
    ]);
    expect(outcomeForKey('3')).toBe('schedule');
    expect(outcomeForKey('7')).toBeNull();
    expect(outcomeForKey('x')).toBeNull();
  });

  it('maps each outcome to a legal status from inbox', () => {
    const cases = [
      { outcome: 'do-now' as const, status: 'done' as const },
      { outcome: 'waiting' as const, status: 'waiting' as const },
      { outcome: 'drop' as const, status: 'dropped' as const },
      { outcome: 'make-project' as const, status: 'next' as const },
      { outcome: 'next-action' as const, status: 'next' as const, input: { nextAction: 'call bank' } },
      {
        outcome: 'schedule' as const,
        status: 'scheduled' as const,
        input: { deferUntil: new Date(2026, 9, 24, 12) },
      },
    ];
    for (const testCase of cases) {
      const result = outcomeTransition(testCase.outcome, testCase.input);
      expect(result.ok, testCase.outcome).toBe(true);
      if (!result.ok) continue;
      expect(result.transition.status).toBe(testCase.status);
      expect(canTransition('inbox', result.transition.status)).toBe(true);
    }
  });

  it('every outcome can be undone back to the inbox', () => {
    for (const status of ['done', 'dropped', 'next', 'scheduled', 'waiting'] as const) {
      expect(canTransition(status, UNDO_STATUS)).toBe(true);
    }
  });

  it('requires a non-empty next action', () => {
    expect(outcomeTransition('next-action', {}).ok).toBe(false);
    expect(outcomeTransition('next-action', { nextAction: '   ' }).ok).toBe(false);
    const ok = outcomeTransition('next-action', { nextAction: '  call bank  ' });
    expect(ok.ok && ok.transition.patch.nextAction).toBe('call bank');
  });

  it('caps the next action at the schema limit', () => {
    const result = outcomeTransition('next-action', { nextAction: 'a'.repeat(600) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transition.patch.nextAction?.length).toBe(500);
  });

  it('requires a valid day for schedule', () => {
    expect(outcomeTransition('schedule', {}).ok).toBe(false);
    expect(outcomeTransition('schedule', { deferUntil: new Date('nope') }).ok).toBe(false);
    const day = new Date(2026, 9, 24, 12);
    const ok = outcomeTransition('schedule', { deferUntil: day });
    expect(ok.ok && ok.transition.patch.deferUntil).toBe(day);
  });

  it('clears a stale defer date for every outcome except schedule', () => {
    for (const outcome of ['do-now', 'waiting', 'drop', 'make-project'] as const) {
      const result = outcomeTransition(outcome);
      expect(result.ok, outcome).toBe(true);
      if (result.ok) expect(result.transition.patch.deferUntil, outcome).toBeNull();
    }
    const next = outcomeTransition('next-action', { nextAction: 'do it' });
    expect(next.ok && next.transition.patch.deferUntil).toBeNull();
  });
});
