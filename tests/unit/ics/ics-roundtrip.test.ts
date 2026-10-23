import { describe, expect, it } from 'vitest';
import { blocksToIcs } from '@/lib/ics/ics-export';
import { icsToBlocks } from '@/lib/ics/ics-import';
import type { Block } from '@/lib/schemas/block';

const NOW = new Date('2026-10-20T09:00:00Z');
const TASK = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function block(overrides: Partial<Block>): Block {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    start: new Date('2026-10-24T07:00:00Z'),
    end: new Date('2026-10-24T09:00:00Z'),
    kind: 'focus',
    title: 'Write the report',
    createdAt: new Date('2026-10-20T08:00:00Z'),
    updatedAt: new Date('2026-10-20T08:00:00Z'),
    ...overrides,
  };
}

/** Round-trippable fields only: timestamps and calendarRef are legitimately new. */
function comparable(b: Block) {
  return {
    id: b.id,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    kind: b.kind,
    title: b.title,
    taskId: b.taskId ?? null,
    projectId: b.projectId ?? null,
  };
}

describe('ICS round trip', () => {
  it('export -> import restores identical blocks', () => {
    const blocks = [
      block({ id: '11111111-1111-4111-8111-111111111111' }),
      block({
        id: '22222222-3333-4444-8555-666666666666',
        start: new Date('2026-10-25T20:30:00Z'),
        end: new Date('2026-10-25T22:30:00Z'),
        kind: 'anchor',
        title: 'Kata, with commas; and backslashes \\ and ☕',
        taskId: TASK,
        projectId: PROJECT,
      }),
    ];

    const imported = icsToBlocks(blocksToIcs(blocks, { now: NOW }), { now: NOW });
    expect(imported.skipped).toEqual([]);
    expect(imported.blocks.map(comparable)).toEqual(blocks.map(comparable));

    // A UID that did not exist before is recorded as calendarRef, so a second
    // export updates the same events instead of duplicating them.
    expect(imported.blocks[0]?.calendarRef).toBe('11111111-1111-4111-8111-111111111111@chrono-kata');
  });

  it('keeps an existing calendarRef as the UID across exports', () => {
    const external = block({ calendarRef: 'google-event-42' });
    const first = blocksToIcs([external], { now: NOW });
    expect(first).toContain('UID:google-event-42');

    const imported = icsToBlocks(first, { now: NOW });
    expect(imported.blocks[0]?.calendarRef).toBe('google-event-42');
    expect(blocksToIcs(imported.blocks, { now: NOW })).toBe(first);
  });

  it('is stable across two round trips (no duplicated or drifting events)', () => {
    const blocks = [block({}), block({ id: '44444444-4444-4444-8444-444444444444', kind: 'fixed' })];
    const once = icsToBlocks(blocksToIcs(blocks, { now: NOW }), { now: NOW }).blocks;
    const twice = icsToBlocks(blocksToIcs(once, { now: NOW }), { now: NOW }).blocks;
    expect(twice.map(comparable)).toEqual(once.map(comparable));
    expect(twice.map((b) => b.id)).toEqual(once.map((b) => b.id));
  });

  it('round-trips a block that crosses a DST change without shifting it', () => {
    // 2026-10-25 03:00 UTC is 06:00 EEST -> 05:00 EET in Helsinki; as an instant
    // it must survive unchanged whatever the device zone is.
    const crossing = block({
      start: new Date('2026-10-24T23:30:00Z'),
      end: new Date('2026-10-25T01:30:00Z'),
      title: 'Across the change',
    });
    const imported = icsToBlocks(blocksToIcs([crossing], { now: NOW }), { now: NOW }).blocks[0];
    expect(imported?.start.toISOString()).toBe(crossing.start.toISOString());
    expect(imported?.end.toISOString()).toBe(crossing.end.toISOString());
  });

  it('round-trips a 23:30-00:30 block whose end is the next UTC day', () => {
    const late = block({
      start: new Date('2026-10-24T23:30:00Z'),
      end: new Date('2026-10-25T00:30:00Z'),
    });
    const ics = blocksToIcs([late], { now: NOW });
    expect(ics).toContain('DTSTART:20261024T233000Z');
    expect(ics).toContain('DTEND:20261025T003000Z');
    const imported = icsToBlocks(ics, { now: NOW }).blocks[0];
    expect(imported?.start.toISOString()).toBe(late.start.toISOString());
    expect(imported?.end.toISOString()).toBe(late.end.toISOString());
  });

  it('round-trips an imported all-day event as the same local calendar day', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:allday-1',
      'DTSTART;VALUE=DATE:20261103',
      'DTEND;VALUE=DATE:20261104',
      'SUMMARY:All day',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const imported = icsToBlocks(ics, { now: NOW }).blocks[0]!;
    const reparsed = icsToBlocks(blocksToIcs([imported], { now: NOW }), { now: NOW }).blocks[0]!;
    expect(reparsed.start.getFullYear()).toBe(2026);
    expect(reparsed.start.getMonth()).toBe(10);
    expect(reparsed.start.getDate()).toBe(3);
    expect(reparsed.start.getHours()).toBe(0);
    expect(reparsed.end.getDate()).toBe(4);
  });
});
