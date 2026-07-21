import { describe, it, expect } from 'vitest';
import { shouldFireReminder, parseTimeString, formatTimeString, getLastLogDate } from '@/lib/notifications/reminder';
import type { Session } from '@/lib/schemas/session';

describe('parseTimeString / formatTimeString', () => {
  it('parses valid HH:MM', () => {
    expect(parseTimeString('20:30')).toEqual({ hours: 20, minutes: 30 });
  });

  it('rejects invalid formats', () => {
    expect(parseTimeString('25:00')).toBeNull();
    expect(parseTimeString('20:60')).toBeNull();
    expect(parseTimeString('bad')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });

  it('formats hours + minutes back to HH:MM with padding', () => {
    expect(formatTimeString({ hours: 8, minutes: 5 })).toBe('08:05');
    expect(formatTimeString({ hours: 20, minutes: 30 })).toBe('20:30');
  });

  it('roundtrips', () => {
    const s = '09:45';
    expect(formatTimeString(parseTimeString(s)!)).toBe(s);
  });
});

describe('shouldFireReminder', () => {
  it('returns false if reminderTime is null', () => {
    expect(shouldFireReminder({ reminderTime: null, notificationsEnabled: true, lastSessionDate: null, now: new Date('2026-07-21T20:30:00') })).toBe(false);
  });

  it('returns false if notificationsEnabled is false', () => {
    expect(shouldFireReminder({ reminderTime: '20:30', notificationsEnabled: false, lastSessionDate: null, now: new Date('2026-07-21T20:30:00') })).toBe(false);
  });

  it('returns false if current time is more than 30 minutes past reminder time', () => {
    expect(shouldFireReminder({ reminderTime: '20:30', notificationsEnabled: true, lastSessionDate: null, now: new Date('2026-07-21T22:00:00') })).toBe(false);
  });

  it('returns false if user already logged today', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: '2026-07-21',
      now: new Date('2026-07-21T20:30:00'),
    })).toBe(false);
  });

  it('returns true within 30-minute window of reminder time when no log today', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: null,
      now: new Date('2026-07-21T20:30:00'),
    })).toBe(true);
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: '2026-07-20',
      now: new Date('2026-07-21T20:45:00'),
    })).toBe(true);
  });

  it('returns true up to 30 minutes before reminder time', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: null,
      now: new Date('2026-07-21T20:00:00'),
    })).toBe(true);
  });
});

describe('getLastLogDate', () => {
  const ses = (date: Date): Session => ({
    id: crypto.randomUUID(),
    startedAt: date,
    durationMinutes: 30,
    reps: null,
    rating: 3,
    createdAt: date,
    updatedAt: date,
  } as Session);

  it('returns most recent local date string', () => {
    const sessions = [
      ses(new Date('2026-07-15T10:00:00')),
      ses(new Date('2026-07-21T10:00:00')),
      ses(new Date('2026-07-18T10:00:00')),
    ];
    const date = new Date('2026-07-21T23:59:59');
    expect(getLastLogDate(sessions, date)).toBe('2026-07-21');
  });

  it('returns null for no sessions', () => {
    expect(getLastLogDate([], new Date('2026-07-21'))).toBeNull();
  });
});
