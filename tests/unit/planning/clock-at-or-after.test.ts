import { afterEach, describe, expect, it } from 'vitest';
import { clockAtOrAfter, localWallClockToEpoch, wakingWindow } from '@/lib/planning/time';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const DAY = '2026-06-15';

describe('clockAtOrAfter', () => {
  it('places an after-midnight clock on the next calendar day of an overnight window', () => {
    process.env.TZ = 'Europe/Helsinki';
    const window = wakingWindow(DAY, { start: '20:00', end: '02:00' });
    const start = clockAtOrAfter(window.start, '00:30');
    expect(new Date(start).getDate()).toBe(16);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getMinutes()).toBe(30);
  });

  it('ends 23:00-01:00 on the next day instead of refusing it', () => {
    process.env.TZ = 'Europe/Helsinki';
    const window = wakingWindow(DAY, { start: '20:00', end: '02:00' });
    const start = clockAtOrAfter(window.start, '23:00');
    const end = clockAtOrAfter(start, '01:00', true);
    expect(end).toBeGreaterThan(start);
    expect(new Date(end).getDate()).toBe(16);
    expect(new Date(end).getHours()).toBe(1);
  });

  it('keeps a same-morning window on its own date', () => {
    process.env.TZ = 'Asia/Kolkata';
    const window = wakingWindow(DAY, { start: '09:00', end: '17:00' });
    const start = clockAtOrAfter(window.start, '09:00');
    expect(start).toBe(localWallClockToEpoch(DAY, '09:00'));
    const end = clockAtOrAfter(start, '10:00', true);
    expect(end).toBe(localWallClockToEpoch(DAY, '10:00'));
  });

  it('survives a fall-back night in Los Angeles', () => {
    process.env.TZ = 'America/Los_Angeles';
    const window = wakingWindow('2026-11-01', { start: '20:00', end: '02:00' });
    const start = clockAtOrAfter(window.start, '00:30');
    const end = clockAtOrAfter(start, '01:30', true);
    expect(end).toBeGreaterThan(start);
    expect(new Date(start).getDate()).toBe(2);
  });

  it('survives a fall-back night in Helsinki', () => {
    process.env.TZ = 'Europe/Helsinki';
    const window = wakingWindow('2026-10-25', { start: '20:00', end: '02:00' });
    const start = clockAtOrAfter(window.start, '00:30');
    expect(new Date(start).getDate()).toBe(26);
    expect(new Date(start).getHours()).toBe(0);
  });
});
