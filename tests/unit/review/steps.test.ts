import { describe, expect, it } from 'vitest';
import { clampStep, REVIEW_STEPS, stepAt } from '@/lib/review/steps';
import { REVIEW_STEP_COUNT } from '@/lib/schemas/review';
import { weekBefore, formatWeekLabel, weekKeyFor, weekRange } from '@/lib/review/week';

describe('the six steps', () => {
  it('match the draft schema bound and keep the roadmap order', () => {
    expect(REVIEW_STEPS).toHaveLength(REVIEW_STEP_COUNT);
    expect(REVIEW_STEPS.map((step) => step.id)).toEqual([
      'inbox',
      'waiting',
      'projects',
      'balance',
      'estimate',
      'shape',
    ]);
    for (const step of REVIEW_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.hint.length).toBeGreaterThan(0);
    }
  });

  it('clamps a stored step into range instead of rendering nothing', () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(2.9)).toBe(2);
    expect(clampStep(99)).toBe(REVIEW_STEP_COUNT - 1);
    expect(stepAt(-1).id).toBe('inbox');
    expect(stepAt(99).id).toBe('shape');
    expect(stepAt(3).id).toBe('balance');
  });
});

describe('week helpers used by the wizard', () => {
  it('names the previous week', () => {
    expect(weekBefore('2026-06-15')).toBe('2026-06-08');
    expect(weekBefore('2026-01-05')).toBe('2025-12-29');
    // A day inside the week normalises to that Monday first.
    expect(weekBefore('2026-06-18')).toBe('2026-06-08');
  });

  it('labels the week from the calendar date, not from the device offset', () => {
    const previousTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const first = formatWeekLabel('2026-06-15');
      process.env.TZ = 'America/Los_Angeles';
      expect(formatWeekLabel('2026-06-15')).toBe(first);
      expect(first).toContain('15');
      // The label names the Monday that starts the week, whatever day is passed.
      expect(formatWeekLabel('2026-06-18')).toBe(first);
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it('keeps weekKeyFor and weekRange agreeing on the same Monday', () => {
    const previousTz = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Helsinki';
      const key = weekKeyFor(new Date(2026, 9, 25, 23, 30));
      expect(key).toBe('2026-10-19');
      expect(weekRange(key)).toEqual(weekRange('2026-10-19'));
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});
