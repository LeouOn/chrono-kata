/**
 * Timezone independence of the ICS module.
 *
 * These assertions must hold in every runner timezone; the suite is run under
 * default TZ, Europe/Helsinki, America/Los_Angeles and Pacific/Kiritimati as a
 * gate (exit codes recorded in the PR). Absolute instants are asserted as UTC;
 * wall-clock and all-day cases assert local components, which is the documented
 * behaviour in each zone.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blocksToIcs, formatIcsUtc } from '@/lib/ics/ics-export';
import { icsToBlocks } from '@/lib/ics/ics-import';
import type { Block } from '@/lib/schemas/block';

const NOW = new Date(2026, 9, 20, 12, 0);
const fixture = (name: string) => readFileSync(`tests/fixtures/ics/${name}.ics`, 'utf8');

function block(start: Date, end: Date, title = 'Block'): Block {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    start,
    end,
    kind: 'focus',
    title,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('TZID events keep their absolute instant in any device zone', () => {
  it('imports the Helsinki DST-crossing fixture identically everywhere', () => {
    const dst = icsToBlocks(fixture('google'), { now: NOW }).blocks.find(
      (b) => b.calendarRef === 'synthetic-google-dst-1@example.test',
    );
    expect(dst?.start.toISOString()).toBe('2026-10-24T20:30:00.000Z');
    expect(dst?.end.toISOString()).toBe('2026-10-24T22:30:00.000Z');
  });

  it('imports the Los Angeles fall-back fixture identically everywhere', () => {
    const dst = icsToBlocks(fixture('apple'), { now: NOW }).blocks.find(
      (b) => b.calendarRef === 'B1C2D3E4-0000-4000-8000-000000000001',
    );
    expect(dst?.start.toISOString()).toBe('2026-11-01T07:30:00.000Z');
    expect(dst?.end.toISOString()).toBe('2026-11-01T10:30:00.000Z');
  });

  it('imports the Outlook Windows-zone fixture identically everywhere', () => {
    const review = icsToBlocks(fixture('outlook'), { now: NOW }).blocks.find((b) =>
      b.calendarRef?.endsWith('OLK1'),
    );
    expect(review?.start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(review?.end.toISOString()).toBe('2026-10-24T08:30:00.000Z');
  });
});

describe('floating and all-day events follow the device zone by design', () => {
  it('keeps floating wall-clock time (09:00-09:45) in any zone', () => {
    const floating = icsToBlocks(fixture('apple'), { now: NOW }).blocks.find(
      (b) => b.calendarRef === 'B1C2D3E4-0000-4000-8000-000000000002',
    );
    expect(floating?.start.getHours()).toBe(9);
    expect(floating?.start.getMinutes()).toBe(0);
    expect(floating?.end.getHours()).toBe(9);
    expect(floating?.end.getMinutes()).toBe(45);
  });

  it('reads an all-day event as local midnight in any zone', () => {
    const allDay = icsToBlocks(fixture('google'), { now: NOW }).blocks.find(
      (b) => b.calendarRef === 'synthetic-google-allday-1@example.test',
    );
    expect(allDay?.start.getHours()).toBe(0);
    expect(allDay?.start.getDate()).toBe(3);
    expect(allDay?.end.getDate()).toBe(4);
  });
});

describe('exported UTC instants survive a zone change', () => {
  it('exports the same string for the same instant in any device zone', () => {
    const ics = blocksToIcs(
      [block(new Date('2026-10-25T00:30:00Z'), new Date('2026-10-25T02:30:00Z'))],
      { now: NOW },
    );
    expect(ics).toContain('DTSTART:20261025T003000Z');
    expect(ics).toContain('DTEND:20261025T023000Z');
  });

  it('round-trips local wall-clock blocks across the DST boundary', () => {
    // Local 23:30 -> 00:30, whatever zone the runner is in.
    const start = new Date(2026, 9, 24, 23, 30);
    const end = new Date(2026, 9, 25, 0, 30);
    const imported = icsToBlocks(blocksToIcs([block(start, end)], { now: NOW }), { now: NOW })
      .blocks[0]!;
    expect(imported.start.getTime()).toBe(start.getTime());
    expect(imported.end.getTime()).toBe(end.getTime());
  });

  it('keeps a block ending exactly at local midnight unchanged', () => {
    const start = new Date(2026, 9, 24, 22, 0);
    const end = new Date(2026, 9, 25, 0, 0); // local midnight
    const imported = icsToBlocks(blocksToIcs([block(start, end)], { now: NOW }), { now: NOW })
      .blocks[0]!;
    expect(imported.start.getTime()).toBe(start.getTime());
    expect(imported.end.getTime()).toBe(end.getTime());
  });

  it('uses UTC formatting independent of the runner zone', () => {
    const date = new Date('2026-10-25T00:30:00Z');
    expect(formatIcsUtc(date)).toBe('20261025T003000Z');
  });
});
