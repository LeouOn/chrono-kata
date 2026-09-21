import { describe, it, expect } from 'vitest';
import { buildEventFromSession, shouldSyncSession } from '@/lib/calendar/sync';
import type { Session } from '@/lib/schemas/session';
import type { Settings } from '@/lib/schemas/settings';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: 'cal-123',
  googleCalendarSyncEnabled: true,
  googleCalendarConnectedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('shouldSyncSession', () => {
  it('returns false if sync disabled', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings({ googleCalendarSyncEnabled: false }))).toBe(false);
  });

  it('returns false if no calendarId', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings({ googleCalendarId: null }))).toBe(false);
  });

  it('returns false for reps-only sessions', () => {
    const s = ses({ durationMinutes: null, reps: 108 });
    expect(shouldSyncSession(s, settings())).toBe(false);
  });

  it('returns true for timed session with all conditions met', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings())).toBe(true);
  });
});

describe('buildEventFromSession', () => {
  it('builds event with start/end derived from startedAt + durationMinutes', () => {
    const startedAt = new Date('2026-07-21T10:00:00Z');
    const s = ses({ startedAt, durationMinutes: 30, reps: null, activityLabel: 'meditation', note: 'still' });
    const event = buildEventFromSession(s);
    expect(event.summary).toBe('meditation');
    expect(event.description).toBe('still');
    expect(event.start.dateTime).toBe(startedAt.toISOString());
    expect(event.end.dateTime).toBe(new Date(startedAt.getTime() + 30 * 60_000).toISOString());
  });

  it('falls back to "chrono-kata session" if no label', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(buildEventFromSession(s).summary).toBe('chrono-kata session');
  });

  it('spans exactly 210000 ms for a 3.5 minute session', () => {
    const startedAt = new Date('2026-09-21T12:00:00Z');
    const s = ses({
      startedAt,
      durationMinutes: 3.5,
      reps: null,
      activityLabel: 'Daily stretches',
    });
    const event = buildEventFromSession(s);
    expect(new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()).toBe(
      210_000
    );
  });
});
