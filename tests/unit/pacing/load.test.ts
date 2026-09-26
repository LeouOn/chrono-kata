import { describe, expect, it } from 'vitest';
import { REP_MINUTES, dailyLoad, rollingLoad, sessionIntensity } from '@/lib/pacing/load';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';

function iso(dayKey: string, hour = 9): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour);
}

function timedSession(dayKey: string, minutes: number, activityLabel?: string): Session {
  return {
    id: crypto.randomUUID(),
    startedAt: iso(dayKey),
    endedAt: null,
    durationMinutes: minutes,
    reps: null,
    rating: 3,
    ...(activityLabel == null ? {} : { activityLabel }),
    createdAt: iso(dayKey, 8),
    updatedAt: iso(dayKey, 8),
  };
}

function repsSession(dayKey: string, reps: number, activityLabel?: string): Session {
  return {
    id: crypto.randomUUID(),
    startedAt: iso(dayKey),
    endedAt: null,
    durationMinutes: null,
    reps,
    rating: 3,
    ...(activityLabel == null ? {} : { activityLabel }),
    createdAt: iso(dayKey, 8),
    updatedAt: iso(dayKey, 8),
  };
}

function template(
  name: string,
  intensity: 1 | 2 | 3 | undefined,
  overrides: Partial<KataTemplate> = {}
): KataTemplate {
  return {
    id: crypto.randomUUID(),
    name,
    mode: 'timed',
    defaultDurationMinutes: 20,
    defaultReps: null,
    defaultNote: undefined,
    icon: '🥋',
    order: 0,
    createdAt: iso('2026-01-01'),
    updatedAt: iso('2026-01-01'),
    ...(intensity == null ? {} : { intensity }),
    ...overrides,
  };
}

describe('sessionIntensity', () => {
  it('matches activityLabel to the template name case- and whitespace-insensitively', () => {
    const templates = [template('Deep Work Sprint', 3)];
    expect(sessionIntensity(timedSession('2026-09-25', 30, 'deep work sprint'), templates)).toBe(3);
    expect(sessionIntensity(timedSession('2026-09-25', 30, '  Deep\nWork  Sprint '), templates)).toBe(3);
    expect(sessionIntensity(timedSession('2026-09-25', 30, 'Deep Work'), templates)).toBe(1);
  });

  it('defaults to 1 when nothing matches, the template has no intensity, or the session has no label', () => {
    expect(sessionIntensity(timedSession('2026-09-25', 30, 'Unknown'), [template('Deep Work', 3)])).toBe(1);
    expect(sessionIntensity(timedSession('2026-09-25', 30, 'Deep Work'), [template('Deep Work', undefined)])).toBe(1);
    expect(sessionIntensity(timedSession('2026-09-25', 30), [template('Deep Work', 3)])).toBe(1);
  });

  it('defaults to 1 with no templates at all', () => {
    expect(sessionIntensity(timedSession('2026-09-25', 30, 'Anything'), [])).toBe(1);
  });
});

describe('REP_MINUTES', () => {
  it('is 0.1, so 50 reps count as 5 load-minutes', () => {
    expect(REP_MINUTES).toBe(0.1);
    const load = dailyLoad([repsSession('2026-09-25', 50)], []);
    expect(load.get('2026-09-25')).toBeCloseTo(5, 10);
  });
});

describe('dailyLoad', () => {
  it('sums durationMinutes x intensity per local day', () => {
    const templates = [template('Zazen', 2)];
    const load = dailyLoad(
      [
        timedSession('2026-09-25', 20, 'Zazen'),
        timedSession('2026-09-25', 10),
        timedSession('2026-09-26', 20, 'Zazen'),
      ],
      templates
    );
    expect(load.size).toBe(2);
    expect(load.get('2026-09-25')).toBe(50);
    expect(load.get('2026-09-26')).toBe(40);
  });

  it('scales reps-only sessions by REP_MINUTES and intensity', () => {
    const templates = [template('Kata Reps', 3)];
    const load = dailyLoad([repsSession('2026-09-25', 50, 'Kata Reps')], templates);
    expect(load.get('2026-09-25')).toBeCloseTo(15, 10);
  });

  it('returns an empty map for no sessions', () => {
    expect(dailyLoad([], [template('Zazen', 2)]).size).toBe(0);
  });

  it('keys by local calendar day, not UTC day', () => {
    // 23:30 local on the 25th stays on the 25th regardless of timezone.
    const late = {
      ...timedSession('2026-09-25', 30),
      startedAt: new Date(2026, 8, 25, 23, 30),
    };
    expect(dailyLoad([late], []).get('2026-09-25')).toBe(30);
  });
});

describe('rollingLoad', () => {
  const daily = new Map<string, number>([
    ['2026-09-20', 10],
    ['2026-09-23', 30],
    ['2026-09-25', 20],
  ]);

  it.each([
    ['2026-09-25', 7, 60],
    ['2026-09-25', 1, 20],
    ['2026-09-25', 3, 50],
    ['2026-09-26', 7, 60],
    ['2026-09-19', 7, 0],
  ])('rollingLoad(daily, %s, %i) -> %i', (end, days, expected) => {
    expect(rollingLoad(daily, end, days)).toBe(expected);
  });

  it('returns 0 for an empty map, non-positive windows, or all-zero loads', () => {
    expect(rollingLoad(new Map(), '2026-09-25', 7)).toBe(0);
    expect(rollingLoad(daily, '2026-09-25', 0)).toBe(0);
    expect(rollingLoad(daily, '2026-09-25', -3)).toBe(0);
    const zeros = new Map([['2026-09-24', 0], ['2026-09-25', 0]]);
    expect(rollingLoad(zeros, '2026-09-25', 7)).toBe(0);
  });
});
