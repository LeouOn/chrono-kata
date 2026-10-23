/**
 * Timezone and DST behaviour of the capture parser.
 *
 * `now` is injected, so these tests are deterministic; each case sets `TZ`
 * itself (the same pattern as tests/unit/tz/date-tz.test.ts) so the suite can
 * run under any default zone. Day keys must always be the LOCAL day, never a
 * UTC slice.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { parseCapture } from '@/lib/capture/parse-capture';

const previousTz = process.env.TZ;

afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function at(tz: string, year: number, month: number, day: number, hour: number, minute = 0): Date {
  process.env.TZ = tz;
  return new Date(year, month - 1, day, hour, minute);
}

function parse(line: string, now: Date) {
  return parseCapture(line, { now });
}

describe('Europe/Helsinki around the DST change (2026-10-25)', () => {
  it('keeps today local at 00:30, where UTC is still the previous day', () => {
    const now = at('Europe/Helsinki', 2026, 10, 25, 0, 30);
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parse('sit today', now)).toMatchObject({ today: '2026-10-25', deferUntil: '2026-10-25' });
  });

  it('rolls tomorrow across the DST change day', () => {
    const now = at('Europe/Helsinki', 2026, 10, 24, 23, 30);
    expect(parse('sit tomorrow', now)).toMatchObject({ deferUntil: '2026-10-25' });
  });

  it('adds relative days across the DST change', () => {
    const now = at('Europe/Helsinki', 2026, 10, 24, 23, 30);
    expect(parse('sit in 2 days', now)).toMatchObject({ deferUntil: '2026-10-26' });
  });

  it('adds a week across the DST change', () => {
    const now = at('Europe/Helsinki', 2026, 10, 20, 12, 0);
    expect(parse('sit in 1 week', now)).toMatchObject({ deferUntil: '2026-10-27' });
  });

  it('resolves bare and next weekday from a Monday', () => {
    const now = at('Europe/Helsinki', 2026, 10, 26, 9, 0);
    expect(now.getDay()).toBe(1);
    expect(parse('plan mon', now)).toMatchObject({ deferUntil: '2026-10-26' });
    expect(parse('plan next mon', now)).toMatchObject({ deferUntil: '2026-11-02' });
  });
});

describe('America/Los_Angeles around the DST change (2026-11-01)', () => {
  it('keeps today local late in the evening, where UTC is already tomorrow', () => {
    const now = at('America/Los_Angeles', 2026, 10, 23, 23, 30);
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parse('sit today', now)).toMatchObject({ today: '2026-10-23', deferUntil: '2026-10-23' });
  });

  it('rolls tomorrow and relative days across the DST change day', () => {
    const now = at('America/Los_Angeles', 2026, 10, 31, 23, 30);
    expect(parse('sit tomorrow', now)).toMatchObject({ deferUntil: '2026-11-01' });
    expect(parse('sit in 2 days', now)).toMatchObject({ deferUntil: '2026-11-02' });
  });

  it('resolves next weekday across the DST change day', () => {
    const now = at('America/Los_Angeles', 2026, 10, 31, 12, 0);
    expect(now.getDay()).toBe(6);
    expect(parse('plan next mon', now)).toMatchObject({ deferUntil: '2026-11-02' });
  });
});

describe('Pacific/Kiritimati (UTC+14)', () => {
  it('keeps today local early in the morning, where UTC is the previous day', () => {
    const now = at('Pacific/Kiritimati', 2026, 10, 24, 0, 30);
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-23');
    expect(parse('sit today', now)).toMatchObject({ today: '2026-10-24', deferUntil: '2026-10-24' });
    expect(parse('sit tomorrow', now)).toMatchObject({ deferUntil: '2026-10-25' });
  });

  it('keeps today local late in the evening', () => {
    const now = at('Pacific/Kiritimati', 2026, 10, 23, 23, 30);
    expect(parse('sit today', now)).toMatchObject({ today: '2026-10-23', deferUntil: '2026-10-23' });
  });
});
