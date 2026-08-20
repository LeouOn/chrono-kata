import { describe, it, expect } from 'vitest';
import {
  buildSessionContextSummary,
  buildCoachUserText,
  buildWeeklyReflectionUserText,
  buildDailyBriefingUserText,
} from '@/lib/llm/prompt-builders';
import type { Session } from '@/lib/schemas/session';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

describe('buildSessionContextSummary', () => {
  it('formats a session in compact form', () => {
    const s = ses({
      startedAt: new Date('2026-07-20T08:30:00Z'),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      activityLabel: 'meditation',
      note: 'still mind',
    });
    const out = buildSessionContextSummary(s);
    expect(out).toMatch(/2026-07-20/);
    expect(out).toMatch(/meditation/);
    expect(out).toMatch(/30m/);
    expect(out).toMatch(/4\/5/);
  });

  it('handles reps sessions', () => {
    const s = ses({ durationMinutes: null, reps: 108, rating: 5 });
    expect(buildSessionContextSummary(s)).toMatch(/108 reps/);
  });

  it('truncates notes to keep total under 120 chars', () => {
    const long = 'a'.repeat(100);
    const s = ses({ note: long });
    expect(buildSessionContextSummary(s).length).toBeLessThan(120);
  });
});

describe('buildCoachUserText', () => {
  it('includes current session fields', () => {
    const s = ses({ durationMinutes: 25, reps: null, rating: 4, activityLabel: 'trading review', note: 'rough open' });
    const out = buildCoachUserText(s, []);
    expect(out).toMatch(/25m/);
    expect(out).toMatch(/trading review/);
    expect(out).toMatch(/rough open/);
    expect(out).toMatch(/4\/5/);
  });

  it('includes last 5 sessions when provided', () => {
    const recent = [
      ses({ startedAt: new Date('2026-07-19T08:00:00Z'), activityLabel: 'sit', durationMinutes: 20, reps: null, rating: 5 }),
    ];
    const s = ses({ durationMinutes: 10, reps: null, rating: 3 });
    const out = buildCoachUserText(s, recent);
    expect(out).toMatch(/Recent sessions/);
    expect(out).toMatch(/sit/);
  });
});

describe('buildWeeklyReflectionUserText', () => {
  it('includes summary stats + session list', () => {
    const sessions = [
      ses({ startedAt: new Date('2026-07-15T10:00:00Z'), durationMinutes: 30, reps: null, rating: 4, activityLabel: 'meditation' }),
      ses({ startedAt: new Date('2026-07-16T10:00:00Z'), durationMinutes: null, reps: 108, rating: 5 }),
    ];
    const out = buildWeeklyReflectionUserText(sessions);
    expect(out).toMatch(/Total sessions: 2/i);
    expect(out).toMatch(/meditation/);
    expect(out).toMatch(/108 reps/);
  });
});

describe('buildDailyBriefingUserText', () => {
  it('includes streak count, recent sessions, and rest day status', () => {
    const recent = [
      ses({ startedAt: new Date('2026-07-20T08:00:00Z'), activityLabel: 'kata', durationMinutes: 20, reps: null, rating: 4 }),
    ];
    const out = buildDailyBriefingUserText({
      streakDays: 7,
      recentSessions: recent,
      displayName: 'Alex',
      isRestDayToday: false,
    });

    expect(out).toMatch(/Current streak: 7 days/i);
    expect(out).toMatch(/Today is a practice day/i);
    expect(out).toMatch(/Alex/);
    expect(out).toMatch(/kata/);
  });

  it('notes designated rest day when active', () => {
    const out = buildDailyBriefingUserText({
      streakDays: 12,
      recentSessions: [],
      isRestDayToday: true,
    });

    expect(out).toMatch(/Today is a designated rest day/i);
  });
});
