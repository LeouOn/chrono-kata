import { describe, expect, it } from 'vitest';
import {
  blocksToIcs,
  blockUid,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
} from '@/lib/ics/ics-export';
import type { Block } from '@/lib/schemas/block';

const NOW = new Date('2026-10-20T09:00:00Z');

function block(overrides: Partial<Block> = {}): Block {
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

/** Undo RFC 5545 folding (CRLF followed by a single space or tab). */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('leaves ordinary text and unicode alone', () => {
    expect(escapeIcsText('café ☕ — fine')).toBe('café ☕ — fine');
  });
});

describe('foldIcsLine', () => {
  it('keeps short lines as they are', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long ASCII lines at 75 octets with a leading space', () => {
    const line = `SUMMARY:${'a'.repeat(200)}`;
    const folded = foldIcsLine(line);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    for (const part of physical) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    for (const part of physical.slice(1)) expect(part.startsWith(' ')).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'🥋 café '.repeat(40)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) {
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
      // A split UTF-8 sequence decodes to U+FFFD.
      expect(Buffer.from(part, 'utf8').toString('utf8')).toBe(part);
      expect(part).not.toContain('\uFFFD');
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe('formatIcsUtc', () => {
  it('formats UTC instants with a trailing Z', () => {
    expect(formatIcsUtc(new Date('2026-10-24T07:05:09Z'))).toBe('20261024T070509Z');
  });
});

describe('blockUid', () => {
  it('prefers an existing calendarRef so re-export updates the event', () => {
    expect(blockUid(block({ calendarRef: 'external-1' }))).toBe('external-1');
  });

  it('falls back to the block id', () => {
    expect(blockUid(block())).toBe('11111111-1111-4111-8111-111111111111@chrono-kata');
  });
});

describe('blocksToIcs', () => {
  it('writes a complete VCALENDAR with CRLF line endings', () => {
    const ics = blocksToIcs([block()], { now: NOW, calendarName: 'My blocks' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('X-WR-CALNAME:My blocks');
  });

  it('writes UTC instants and a DTSTAMP from the injected clock', () => {
    const ics = blocksToIcs([block()], { now: NOW });
    expect(ics).toContain('DTSTAMP:20261020T090000Z');
    expect(ics).toContain('DTSTART:20261024T070000Z');
    expect(ics).toContain('DTEND:20261024T090000Z');
  });

  it('carries kind, task, project and the block id as X- properties', () => {
    const taskId = '22222222-2222-4222-8222-222222222222';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const ics = blocksToIcs([block({ kind: 'anchor', taskId, projectId })], { now: NOW });
    expect(ics).toContain('X-CHRONO-KATA-KIND:anchor');
    expect(ics).toContain(`X-CHRONO-KATA-TASK-ID:${taskId}`);
    expect(ics).toContain(`X-CHRONO-KATA-PROJECT-ID:${projectId}`);
    expect(ics).toContain('X-CHRONO-KATA-BLOCK-ID:11111111-1111-4111-8111-111111111111');
  });

  it('escapes a title with separators and newlines', () => {
    const ics = blocksToIcs([block({ title: 'a,b;c\\d\ne' })], { now: NOW });
    expect(ics).toContain('SUMMARY:a\\,b\\;c\\\\d\\ne');
  });

  it('is deterministic regardless of input order', () => {
    const early = block({ id: '11111111-1111-4111-8111-111111111111' });
    const late = block({
      id: '44444444-4444-4444-8444-444444444444',
      start: new Date('2026-10-25T07:00:00Z'),
      end: new Date('2026-10-25T08:00:00Z'),
    });
    const a = blocksToIcs([early, late], { now: NOW });
    const b = blocksToIcs([late, early], { now: NOW });
    expect(a).toBe(b);
    expect(a.indexOf('DTSTART:20261024T070000Z')).toBeLessThan(a.indexOf('DTSTART:20261025T070000Z'));
  });

  it('produces one VEVENT per block', () => {
    const ics = blocksToIcs([block(), block({ id: '55555555-5555-4555-8555-555555555555' })], {
      now: NOW,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it('handles an empty block list', () => {
    const ics = blocksToIcs([], { now: NOW });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
