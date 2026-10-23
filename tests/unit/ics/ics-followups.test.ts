import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { icsToBlocks } from '@/lib/ics/ics-import';

const NOW = new Date(2026, 9, 20, 12, 0);
const fixture = (name: string) => readFileSync(`tests/fixtures/ics/${name}.ics`, 'utf8');

describe('A: a TZID that is neither a usable VTIMEZONE nor an IANA zone is skipped', () => {
  it('does not import a wall time as UTC when the VTIMEZONE is broken', () => {
    const result = icsToBlocks(fixture('broken-timezone'), { now: NOW });
    expect(result.blocks).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/unsupported timezone "Nowhere\/Land"/);
  });

  it('still imports a file with a usable custom VTIMEZONE (Outlook fixture)', () => {
    const result = icsToBlocks(fixture('outlook'), { now: NOW });
    expect(result.blocks.length).toBe(2);
    expect(result.skipped.map((s) => s.reason)).toEqual(['cancelled event']);
  });
});

describe('B: RECURRENCE-ID replaces the instance instead of duplicating the day', () => {
  it('moves the overridden occurrence and keeps the series length', () => {
    const result = icsToBlocks(fixture('recurrence-override'), { now: NOW });
    expect(result.skipped).toEqual([]);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks.map((b) => b.start.toISOString())).toEqual([
      '2026-10-19T06:00:00.000Z',
      '2026-10-20T11:00:00.000Z',
      '2026-10-21T06:00:00.000Z',
    ]);
    const moved = result.blocks[1]!;
    expect(moved.end.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(moved.title).toBe('Invented daily practice (moved)');
    expect(moved.calendarRef).toBe('synthetic-override-series-1@example.test');
  });

  it('gives the moved occurrence a stable id across imports', () => {
    const first = icsToBlocks(fixture('recurrence-override'), { now: NOW }).blocks;
    const second = icsToBlocks(fixture('recurrence-override'), { now: NOW }).blocks;
    expect(first.map((b) => b.id)).toEqual(second.map((b) => b.id));
  });
});

describe('C: a leading UTF-8 BOM does not lose the file', () => {
  it('imports a BOM-prefixed calendar exactly like the plain one', () => {
    const plain = fixture('google');
    const withBom = `\uFEFF${plain}`;
    const a = icsToBlocks(plain, { now: NOW });
    const b = icsToBlocks(withBom, { now: NOW });
    expect(b.skipped).toEqual(a.skipped);
    expect(b.blocks.map((x) => x.start.toISOString())).toEqual(a.blocks.map((x) => x.start.toISOString()));
    expect(b.blocks.length).toBeGreaterThan(0);
  });
});

describe('D: the truncation reason says which cap fired', () => {
  const event = (rule: string, dtstart = '20261021T070000Z') =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:cap-test',
      `DTSTART:${dtstart}`,
      'DTEND:20261021T080000Z',
      `RRULE:${rule}`,
      'SUMMARY:Cap test',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

  it('reports the occurrence cap when that is what stopped it', () => {
    const result = icsToBlocks(event('FREQ=DAILY'), { now: NOW, maxOccurrencesPerEvent: 5 });
    expect(result.blocks).toHaveLength(5);
    expect(result.skipped[0]?.reason).toBe('recurrence truncated at 5 occurrences');
  });

  it('reports the iteration cap when that is what stopped it', () => {
    const result = icsToBlocks(event('FREQ=MINUTELY;COUNT=999999999', '20000101T000000Z'), {
      now: NOW,
    });
    expect(result.blocks).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('recurrence truncated at the 100000-iteration cap');
  });
});
