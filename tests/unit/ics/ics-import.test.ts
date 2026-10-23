import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { icsToBlocks, stableUuidFromString, wallTimeInZoneToUtc } from '@/lib/ics/ics-import';

const NOW = new Date(2026, 9, 20, 12, 0);

const fixture = (name: string) => readFileSync(`tests/fixtures/ics/${name}.ics`, 'utf8');

function wrap(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;
}

function event(lines: string[]): string {
  return wrap(`BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`);
}

describe('fixtures shaped like real calendar exports', () => {
  it('imports a Google Calendar style export (VTIMEZONE, all-day, recurrence)', () => {
    const result = icsToBlocks(fixture('google'), { now: NOW });
    expect(result.skipped).toEqual([]);

    const dst = result.blocks.find((b) => b.calendarRef === 'synthetic-google-dst-1@example.test');
    expect(dst?.start.toISOString()).toBe('2026-10-24T20:30:00.000Z');
    expect(dst?.end.toISOString()).toBe('2026-10-24T22:30:00.000Z');
    expect(dst?.title).toBe('Workshop night shift');

    const allDay = result.blocks.find((b) => b.calendarRef === 'synthetic-google-allday-1@example.test');
    expect(allDay?.start.getHours()).toBe(0);
    expect(allDay?.start.getMinutes()).toBe(0);
    expect(allDay!.end.getTime() - allDay!.start.getTime()).toBe(24 * 60 * 60 * 1000);

    const recurring = result.blocks.filter((b) => b.calendarRef === 'synthetic-google-recurring-1@example.test');
    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring[0]?.start.getTime()).toBeGreaterThanOrEqual(result.window.from.getTime());
  });

  it('imports an Apple Calendar style export (fall-back DST, floating event)', () => {
    const result = icsToBlocks(fixture('apple'), { now: NOW });
    expect(result.skipped).toEqual([]);

    const dst = result.blocks.find((b) => b.calendarRef === 'B1C2D3E4-0000-4000-8000-000000000001');
    // 00:30 PDT -> 02:30 PST: two wall-clock hours, three real hours.
    expect(dst?.start.toISOString()).toBe('2026-11-01T07:30:00.000Z');
    expect(dst?.end.toISOString()).toBe('2026-11-01T10:30:00.000Z');

    const floating = result.blocks.find((b) => b.calendarRef === 'B1C2D3E4-0000-4000-8000-000000000002');
    expect(floating?.start.getHours()).toBe(9);
    expect(floating?.start.getMinutes()).toBe(0);
    expect(floating?.end.getHours()).toBe(9);
    expect(floating?.end.getMinutes()).toBe(45);
  });

  it('imports an Outlook style export (Windows VTIMEZONE, DURATION, CANCELLED)', () => {
    const result = icsToBlocks(fixture('outlook'), { now: NOW });
    expect(result.blocks).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe('cancelled event');

    const review = result.blocks.find((b) => b.calendarRef?.endsWith('OLK1'));
    expect(review?.start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(review?.end.toISOString()).toBe('2026-10-24T08:30:00.000Z');
    expect(review?.title).toBe('Invented Berlin review');

    const durationOnly = result.blocks.find((b) => b.calendarRef?.endsWith('OLK2'));
    expect(durationOnly?.end.getTime()! - durationOnly!.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });
});

describe('time encodings', () => {
  it('reads UTC instants exactly', () => {
    const [block] = icsToBlocks(
      event(['UID:u1', 'DTSTART:20261024T070000Z', 'DTEND:20261024T083000Z', 'SUMMARY:UTC']),
      { now: NOW },
    ).blocks;
    expect(block?.start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(block?.end.toISOString()).toBe('2026-10-24T08:30:00.000Z');
  });

  it('reads floating times as the device wall clock', () => {
    const [block] = icsToBlocks(
      event(['UID:u2', 'DTSTART:20261024T090000', 'DTEND:20261024T100000', 'SUMMARY:Floating']),
      { now: NOW },
    ).blocks;
    expect(block?.start.getFullYear()).toBe(2026);
    expect(block?.start.getMonth()).toBe(9);
    expect(block?.start.getDate()).toBe(24);
    expect(block?.start.getHours()).toBe(9);
  });

  it('resolves an IANA TZID that has no VTIMEZONE in the file', () => {
    const [block] = icsToBlocks(
      event([
        'UID:u3',
        'DTSTART;TZID=Europe/Helsinki:20261024T233000',
        'DTEND;TZID=Europe/Helsinki:20261025T013000',
        'SUMMARY:Helsinki night',
      ]),
      { now: NOW },
    ).blocks;
    expect(block?.start.toISOString()).toBe('2026-10-24T20:30:00.000Z');
    expect(block?.end.toISOString()).toBe('2026-10-24T22:30:00.000Z');
  });

  it('skips an unknown TZID instead of silently reading it as local time', () => {
    const result = icsToBlocks(
      event(['UID:u4', 'DTSTART;TZID=Mars/Olympus:20261024T090000', 'DTEND;TZID=Mars/Olympus:20261024T100000']),
      { now: NOW },
    );
    expect(result.blocks).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/unsupported timezone "Mars\/Olympus"/);
  });

  it('reads an all-day VALUE=DATE with an exclusive end', () => {
    const [block] = icsToBlocks(
      event(['UID:u5', 'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261105', 'SUMMARY:Two days']),
      { now: NOW },
    ).blocks;
    expect(block?.start.getDate()).toBe(3);
    expect(block?.start.getHours()).toBe(0);
    expect(block?.end.getDate()).toBe(5);
    expect(block?.end.getHours()).toBe(0);
  });

  it('reads DURATION instead of DTEND', () => {
    const [block] = icsToBlocks(
      event(['UID:u6', 'DTSTART:20261024T070000Z', 'DURATION:PT1H30M', 'SUMMARY:Duration']),
      { now: NOW },
    ).blocks;
    expect(block?.end.getTime()! - block!.start.getTime()).toBe(90 * 60 * 1000);
  });
});

describe('recurrence', () => {
  it('expands DAILY with COUNT inside the window', () => {
    const result = icsToBlocks(
      event([
        'UID:r1',
        'DTSTART:20261021T070000Z',
        'DTEND:20261021T080000Z',
        'RRULE:FREQ=DAILY;COUNT=4',
        'SUMMARY:Daily',
      ]),
      { now: NOW },
    );
    expect(result.blocks.map((b) => b.start.toISOString())).toEqual([
      '2026-10-21T07:00:00.000Z',
      '2026-10-22T07:00:00.000Z',
      '2026-10-23T07:00:00.000Z',
      '2026-10-24T07:00:00.000Z',
    ]);
  });

  it('honours UNTIL, INTERVAL and BYDAY', () => {
    const result = icsToBlocks(
      event([
        'UID:r2',
        'DTSTART:20261019T070000Z',
        'DTEND:20261019T080000Z',
        'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261130T000000Z',
        'SUMMARY:Every other week',
      ]),
      { now: NOW },
    );
    expect(result.blocks.length).toBeGreaterThan(2);
    for (const b of result.blocks) {
      expect([1, 3]).toContain(b.start.getUTCDay());
    }
  });

  it('honours EXDATE', () => {
    const result = icsToBlocks(
      event([
        'UID:r3',
        'DTSTART:20261021T070000Z',
        'DTEND:20261021T080000Z',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE:20261022T070000Z',
        'SUMMARY:With exception',
      ]),
      { now: NOW },
    );
    expect(result.blocks.map((b) => b.start.getUTCDate())).toEqual([21, 23]);
  });

  it('gives every occurrence a distinct, stable id', () => {
    const ics = event([
      'UID:r4',
      'DTSTART:20261021T070000Z',
      'DTEND:20261021T080000Z',
      'RRULE:FREQ=DAILY;COUNT=3',
      'SUMMARY:Distinct',
    ]);
    const first = icsToBlocks(ics, { now: NOW }).blocks;
    const second = icsToBlocks(ics, { now: NOW }).blocks;
    expect(new Set(first.map((b) => b.id)).size).toBe(3);
    expect(first.map((b) => b.id)).toEqual(second.map((b) => b.id));
    expect(first.map((b) => b.calendarRef)).toEqual(['r4', 'r4', 'r4']);
  });

  it('reports truncation at the occurrence cap instead of dropping silently', () => {
    const result = icsToBlocks(
      event([
        'UID:r5',
        'DTSTART:20261021T070000Z',
        'DTEND:20261021T080000Z',
        'RRULE:FREQ=DAILY',
        'SUMMARY:Forever',
      ]),
      { now: NOW, maxOccurrencesPerEvent: 5 },
    );
    expect(result.blocks).toHaveLength(5);
    expect(result.skipped.some((s) => s.reason === 'recurrence truncated at 5 occurrences')).toBe(true);
  });

  it('does not import occurrences that fall outside the window', () => {
    const result = icsToBlocks(
      event([
        'UID:r6',
        'DTSTART:20200101T070000Z',
        'DTEND:20200101T080000Z',
        'RRULE:FREQ=YEARLY;COUNT=100',
        'SUMMARY:Old series',
      ]),
      { now: NOW },
    );
    // YEARLY from 2020: only 2027-01-01 falls inside [now-7d, now+366d].
    expect(result.blocks.map((b) => b.start.toISOString())).toEqual([
      '2027-01-01T07:00:00.000Z',
    ]);
    expect(result.skipped).toEqual([]); // out of window is not an error
  });
});

describe('event metadata and degraded input', () => {
  it('restores kind, task and project from X- properties', () => {
    const taskId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const [block] = icsToBlocks(
      event([
        'UID:m1',
        'DTSTART:20261021T070000Z',
        'DTEND:20261021T080000Z',
        'SUMMARY:Linked',
        'X-CHRONO-KATA-KIND:anchor',
        `X-CHRONO-KATA-TASK-ID:${taskId}`,
        `X-CHRONO-KATA-PROJECT-ID:${projectId}`,
      ]),
      { now: NOW },
    ).blocks;
    expect(block?.kind).toBe('anchor');
    expect(block?.taskId).toBe(taskId);
    expect(block?.projectId).toBe(projectId);
  });

  it('uses defaultKind when the X- kind is missing or invalid', () => {
    const ics = event(['UID:m2', 'DTSTART:20261021T070000Z', 'DTEND:20261021T080000Z', 'SUMMARY:No kind']);
    expect(icsToBlocks(ics, { now: NOW, defaultKind: 'anchor' }).blocks[0]?.kind).toBe('anchor');

    const invalid = event([
      'UID:m3',
      'DTSTART:20261021T070000Z',
      'DTEND:20261021T080000Z',
      'SUMMARY:Bad kind',
      'X-CHRONO-KATA-KIND:urgent',
    ]);
    expect(icsToBlocks(invalid, { now: NOW, defaultKind: 'focus' }).blocks[0]?.kind).toBe('focus');
  });

  it('titles an event without SUMMARY', () => {
    const [block] = icsToBlocks(event(['UID:m4', 'DTSTART:20261021T070000Z', 'DTEND:20261021T080000Z']), {
      now: NOW,
    }).blocks;
    expect(block?.title).toBe('Untitled event');
  });

  it('synthesises a stable UID and id when UID is missing', () => {
    const ics = event(['DTSTART:20261021T070000Z', 'DTEND:20261021T080000Z', 'SUMMARY:No uid']);
    const a = icsToBlocks(ics, { now: NOW }).blocks[0];
    const b = icsToBlocks(ics, { now: NOW }).blocks[0];
    expect(a?.calendarRef).toMatch(/^no-uid-/);
    expect(a?.id).toBe(b?.id);
  });

  it('skips CANCELLED events', () => {
    const result = icsToBlocks(
      event(['UID:m5', 'DTSTART:20261021T070000Z', 'DTEND:20261021T080000Z', 'STATUS:CANCELLED']),
      { now: NOW },
    );
    expect(result.blocks).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ reason: 'cancelled event', uid: 'm5' });
  });

  it('skips events without DTSTART', () => {
    const result = icsToBlocks(event(['UID:m6', 'DTEND:20261021T080000Z']), { now: NOW });
    expect(result.skipped[0]?.reason).toBe('missing DTSTART');
  });

  it('never throws on malformed input', () => {
    const result = icsToBlocks('this is not a calendar', { now: NOW });
    expect(result.blocks).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/invalid calendar/);
  });

  it('reports a calendar with no events', () => {
    const result = icsToBlocks(wrap(''), { now: NOW });
    expect(result.skipped[0]?.reason).toBe('no VEVENT components found');
  });

  it('reads an empty string as invalid rather than throwing', () => {
    expect(() => icsToBlocks('', { now: NOW })).not.toThrow();
    expect(icsToBlocks('', { now: NOW }).blocks).toEqual([]);
  });
});

describe('stable ids', () => {
  it('produces UUID-v4-shaped ids deterministically', () => {
    const id = stableUuidFromString('some-uid#2026-10-24T07:00:00.000Z');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuidFromString('some-uid#2026-10-24T07:00:00.000Z')).toBe(id);
    expect(stableUuidFromString('other')).not.toBe(id);
  });
});

describe('wallTimeInZoneToUtc', () => {
  it('handles both sides of a DST boundary', () => {
    const summer = wallTimeInZoneToUtc(
      { year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 },
      'Europe/Helsinki',
    );
    const winter = wallTimeInZoneToUtc(
      { year: 2026, month: 12, day: 1, hour: 12, minute: 0, second: 0 },
      'Europe/Helsinki',
    );
    expect(summer?.toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(winter?.toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });

  it('returns null for an unknown zone', () => {
    expect(
      wallTimeInZoneToUtc({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, 'Nowhere/Nothing'),
    ).toBeNull();
  });
});
