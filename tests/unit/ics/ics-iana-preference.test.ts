/**
 * An IANA `TZID` resolves through the tz database even when the file ships a
 * VTIMEZONE. A stale definition otherwise produced a silently wrong instant,
 * and made the same event import differently with and without its VTIMEZONE.
 * Non-IANA names (Outlook's "W. Europe Standard Time") still use the file's
 * VTIMEZONE, because Intl cannot resolve them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { icsToBlocks } from '@/lib/ics/ics-import';

const NOW = new Date(2026, 9, 20, 12, 0);
const fixture = (name: string) => readFileSync(`tests/fixtures/ics/${name}.ics`, 'utf8');

function event(tzid: string | null): string {
  const param = tzid ? `;TZID=${tzid}` : '';
  const value = tzid ? ':20261024T090000' : ':20261024T090000Z';
  const end = tzid ? ':20261024T100000' : ':20261024T100000Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:synthetic-iana-${tzid ?? 'utc'}`,
    `DTSTART${param}${value}`,
    `DTEND${param}${end}`,
    'SUMMARY:Invented event',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('IANA TZIDs prefer the tz database', () => {
  it('ignores a stale VTIMEZONE for an IANA name', () => {
    // 09:00 Helsinki on 2026-10-24 is EEST (+03:00) = 06:00Z; the fixture's
    // VTIMEZONE claims +01:00 all year, which would give 08:00Z.
    const stale = icsToBlocks(fixture('stale-timezone'), { now: NOW });
    expect(stale.skipped).toEqual([]);
    expect(stale.blocks[0]?.start.toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(stale.blocks[0]?.end.toISOString()).toBe('2026-10-24T07:00:00.000Z');
  });

  it('resolves the same event identically with and without a VTIMEZONE', () => {
    const withVtimezone = icsToBlocks(
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Europe/Helsinki\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0100\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n${event('Europe/Helsinki').split('\r\n').slice(2).join('\r\n')}`,
      { now: NOW },
    );
    const plainly = icsToBlocks(event('Europe/Helsinki'), { now: NOW });
    expect(withVtimezone.blocks[0]?.start.toISOString()).toBe(plainly.blocks[0]?.start.toISOString());
    expect(withVtimezone.blocks[0]?.start.toISOString()).toBe('2026-10-24T06:00:00.000Z');
  });

  it('leaves the DST-crossing Google fixture unchanged', () => {
    const dst = icsToBlocks(fixture('google'), { now: NOW }).blocks.find(
      (b) => b.calendarRef === 'synthetic-google-dst-1@example.test',
    );
    expect(dst?.start.toISOString()).toBe('2026-10-24T20:30:00.000Z');
    expect(dst?.end.toISOString()).toBe('2026-10-24T22:30:00.000Z');
  });

  it('still uses the file VTIMEZONE for a Windows zone name', () => {
    const review = icsToBlocks(fixture('outlook'), { now: NOW }).blocks.find((b) =>
      b.calendarRef?.endsWith('OLK1'),
    );
    expect(review?.start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
  });

  it('still skips a TZID that is neither IANA nor usable', () => {
    const broken = icsToBlocks(fixture('broken-timezone'), { now: NOW });
    expect(broken.blocks).toEqual([]);
    expect(broken.skipped[0]?.reason).toMatch(/unsupported timezone/);
  });
});
