import { describe, expect, it } from 'vitest';
import {
  EMPTY_DECISIONS,
  normaliseIntentions,
  parseDecisions,
  serialiseDecisions,
  withProjectDecision,
  withSweep,
  withoutSweep,
} from '@/lib/review/decisions';
import { NOTES_MAX, NEXT_ACTION_MAX, INTENTION_MAX_MINUTES } from '@/lib/review/limits';
import { isValidDeferDay } from '@/lib/review/decisions';

const TASK_A = '11111111-1111-4111-8111-111111111111';
const TASK_B = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const DOMAIN = '44444444-4444-4444-8444-444444444444';

describe('parseDecisions', () => {
  it('returns empty decisions for anything that is not a record', () => {
    expect(parseDecisions(undefined)).toEqual(EMPTY_DECISIONS);
    expect(parseDecisions(null)).toEqual(EMPTY_DECISIONS);
    expect(parseDecisions('nope')).toEqual(EMPTY_DECISIONS);
    expect(parseDecisions([])).toEqual(EMPTY_DECISIONS);
  });

  it('keeps every valid entry and drops only the invalid ones', () => {
    const parsed = parseDecisions({
      sweep: {
        [TASK_A]: { action: 'redefine', nextAction: 'find the email' },
        [TASK_B]: { action: 'drop' },
        'not-a-uuid': { action: 'keep' },
        [PROJECT]: { action: 'explode' },
        [DOMAIN]: { action: 'defer', deferUntil: '2026-06-30', nextAction: 'x'.repeat(NEXT_ACTION_MAX + 1) },
      },
      projects: {
        [PROJECT]: { status: 'paused', breadcrumb: 'next: outline' },
        [TASK_A]: { status: 'archived' },
        'not-a-uuid': { status: 'active' },
      },
      weekIntentions: { [DOMAIN]: 120, [TASK_A]: -5, [TASK_B]: 1.5, 'nope': 30 },
      nextWeekIntentions: { [DOMAIN]: 0 },
      notes: 'a week of small steps',
    });

    expect(Object.keys(parsed.sweep).sort()).toEqual([TASK_A, TASK_B].sort());
    expect(parsed.sweep[TASK_A]).toEqual({ action: 'redefine', nextAction: 'find the email' });
    expect(Object.keys(parsed.projects)).toEqual([PROJECT]);
    expect(parsed.projects[PROJECT]).toEqual({ status: 'paused', breadcrumb: 'next: outline' });
    expect(parsed.weekIntentions).toEqual({ [DOMAIN]: 120 });
    expect(parsed.nextWeekIntentions).toEqual({ [DOMAIN]: 0 });
    expect(parsed.notes).toBe('a week of small steps');
  });

  it('clamps notes on the normalised value instead of storing an over-long draft', () => {
    const parsed = parseDecisions({ notes: 'x'.repeat(NOTES_MAX + 500) });
    expect(parsed.notes).toHaveLength(NOTES_MAX);
    // The value the wizard would store is therefore always schema-valid.
    expect(serialiseDecisions(parsed).notes).toHaveLength(NOTES_MAX);
  });

  it('drops an intention above one week of minutes', () => {
    expect(parseDecisions({ weekIntentions: { [DOMAIN]: INTENTION_MAX_MINUTES + 1 } }).weekIntentions).toEqual({});
    expect(parseDecisions({ weekIntentions: { [DOMAIN]: INTENTION_MAX_MINUTES } }).weekIntentions).toEqual({
      [DOMAIN]: INTENTION_MAX_MINUTES,
    });
  });
});

describe('isValidDeferDay', () => {
  it('allows today and later, and nothing else', () => {
    const today = '2026-06-15';
    // "Pick a day from today onwards" includes today itself.
    expect(isValidDeferDay(today, today)).toBe(true);
    expect(isValidDeferDay('2026-06-16', today)).toBe(true);
    expect(isValidDeferDay('2026-06-14', today)).toBe(false);
    expect(isValidDeferDay('not-a-day', today)).toBe(false);
    expect(isValidDeferDay('', today)).toBe(false);
    expect(isValidDeferDay('2026-13-01', today)).toBe(false);
  });
});

describe('serialiseDecisions', () => {
  it('round-trips through parse', () => {
    const decisions = {
      ...EMPTY_DECISIONS,
      sweep: { [TASK_A]: { action: 'keep' as const } },
      projects: { [PROJECT]: { status: 'active' as const } },
      weekIntentions: { [DOMAIN]: 90 },
      nextWeekIntentions: { [DOMAIN]: 60 },
      notes: 'kept it light',
    };
    expect(parseDecisions(serialiseDecisions(decisions))).toEqual(decisions);
  });
});

describe('decision helpers', () => {
  it('never mutate the record they are given', () => {
    const base = { ...EMPTY_DECISIONS };
    const withOne = withSweep(base, TASK_A, { action: 'drop' });
    expect(base.sweep).toEqual({});
    expect(withOne.sweep[TASK_A]).toEqual({ action: 'drop' });
    expect(withoutSweep(withOne, TASK_A).sweep).toEqual({});
    expect(withOne.sweep[TASK_A]).toEqual({ action: 'drop' });

    const withProject = withProjectDecision(base, PROJECT, { status: 'paused' });
    expect(base.projects).toEqual({});
    expect(withProject.projects[PROJECT]).toEqual({ status: 'paused' });
    expect(withProjectDecision(withProject, PROJECT, { breadcrumb: 'next' }).projects[PROJECT]).toEqual({
      status: 'paused',
      breadcrumb: 'next',
    });
  });

  it('normalises an intentions record to the schema shape', () => {
    expect(normaliseIntentions({ [DOMAIN]: 45, bogus: 'x' })).toEqual({ [DOMAIN]: 45 });
    expect(normaliseIntentions(null)).toEqual({});
  });
});
