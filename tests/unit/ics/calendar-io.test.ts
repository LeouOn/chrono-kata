import { describe, expect, it } from 'vitest';
import {
  buildImportPreview,
  describeRecurrence,
  validateSubscriptionUrl,
  withSkips,
} from '@/lib/ics/calendar-io';
import type { Block } from '@/lib/schemas/block';

const T0 = new Date('2026-03-01T09:00:00Z');

/** Deterministic UUID for a short key, so fixtures satisfy BlockSchema. */
function uuid(key: string): string {
  const hex = [...key].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const body = hex.toString(16).padStart(8, '0');
  return `00000000-0000-4000-8000-${body}${'0'.repeat(Math.max(0, 12 - body.length))}`.slice(0, 36);
}

function block(partial: Partial<Block> & { id: string }): Block {
  return {
    start: T0,
    end: new Date(T0.getTime() + 60 * 60 * 1000),
    kind: 'fixed',
    title: 'Trading session',
    taskId: null,
    projectId: null,
    calendarRef: `ref-${partial.id}`,
    createdAt: T0,
    updatedAt: T0,
    ...partial,
    id: uuid(partial.id),
  } as Block;
}

describe('buildImportPreview (calendarRef reconciliation)', () => {
  it('marks imported blocks with no matching ref as new', () => {
    const preview = buildImportPreview(
      [block({ id: 'a1', calendarRef: 'evt-1@cal' })],
      [],
    );
    expect(preview.counts).toEqual({ new: 1, updated: 0, unchanged: 0, skipped: 0 });
    expect(preview.toWrite).toHaveLength(1);
  });

  it('re-importing the same event is unchanged, not a duplicate', () => {
    const existing = [block({ id: 'local-1', calendarRef: 'evt-1@cal' })];
    const preview = buildImportPreview([block({ id: 'imported-1', calendarRef: 'evt-1@cal' })], existing);
    expect(preview.counts).toEqual({ new: 0, updated: 0, unchanged: 1, skipped: 0 });
    expect(preview.toWrite).toHaveLength(0);
  });

  it('a moved/edited event updates in place, keeping the local id and createdAt', () => {
    const existing = [block({ id: 'local-1', calendarRef: 'evt-1@cal', title: 'Old title' })];
    const moved = block({
      id: 'derived-9',
      calendarRef: 'evt-1@cal',
      title: 'New title',
      start: new Date(T0.getTime() + 24 * 3600 * 1000),
      end: new Date(T0.getTime() + 25 * 3600 * 1000),
    });
    const preview = buildImportPreview([moved], existing);
    expect(preview.counts).toEqual({ new: 0, updated: 1, unchanged: 0, skipped: 0 });
    expect(preview.toWrite[0]!.id).toBe(uuid('local-1'));
    expect(preview.toWrite[0]!.createdAt.getTime()).toBe(existing[0]!.createdAt.getTime());
    expect(preview.toWrite[0]!.title).toBe('New title');
  });

  it('keys on calendarRef, not id: an override with a fresh id updates, never duplicates', () => {
    // wave-08 design note: a RECURRENCE-ID move imports with a fresh id but the same ref.
    const existing = [block({ id: 'local-1', calendarRef: 'series-7@cal' })];
    const moved = block({
      id: 'completely-different-id',
      calendarRef: 'series-7@cal',
      start: new Date(T0.getTime() + 48 * 3600 * 1000),
      end: new Date(T0.getTime() + 49 * 3600 * 1000),
    });
    const preview = buildImportPreview([moved], existing);
    expect(preview.counts.updated).toBe(1);
    expect(preview.counts.new).toBe(0);
  });

  it('hand-made blocks (no calendarRef) are never matched and never written', () => {
    const handmade = block({ id: 'local-1' });
    delete (handmade as { calendarRef?: string }).calendarRef;
    // Even an exact content collision (same title, same time) must not match:
    // matching is by calendarRef, never by content — a hand-made lookalike is
    // invisible to the import.
    const lookalike = { ...handmade, id: 'local-2' };
    delete (lookalike as { calendarRef?: string }).calendarRef;
    const preview = buildImportPreview(
      [block({ id: 'i-1', calendarRef: 'evt-1@cal', title: handmade.title, start: handmade.start, end: handmade.end })],
      [handmade, lookalike],
    );
    expect(preview.counts.new).toBe(1);
    expect(preview.counts.updated).toBe(0);
    expect(preview.counts.unchanged).toBe(0);
    // The write plan contains only the imported block.
    expect(preview.toWrite.map((b) => b.id)).toEqual([uuid('i-1')]);
  });

  it('the same occurrence twice in one file (same ref and id) appears once', () => {
    const twice = block({ id: 'i-1', calendarRef: 'evt-1@cal' });
    const preview = buildImportPreview([twice, { ...twice }], []);
    expect(preview.entries).toHaveLength(1);
    expect(preview.counts.new).toBe(1);
  });

  it('withSkips carries the importer reasons into the counts', () => {
    const base = buildImportPreview([block({ id: 'i-1', calendarRef: 'r1' })], []);
    const preview = withSkips(base, [{ reason: 'unsupported timezone "Nowhere/Land"' }]);
    expect(preview.counts.skipped).toBe(1);
    expect(preview.skipped[0]!.reason).toContain('unsupported timezone');
  });
});

describe('describeRecurrence', () => {
  it('summarises a series imported as several occurrences', () => {
    const entries = [
      { block: block({ id: 'a', calendarRef: 'weekly@cal' }), verdict: 'new' as const },
      { block: block({ id: 'b', calendarRef: 'weekly@cal' }), verdict: 'new' as const },
      { block: block({ id: 'c', calendarRef: 'weekly@cal' }), verdict: 'new' as const },
    ];
    expect(describeRecurrence(entries)).toMatch(/3 occurrences/);
  });

  it('returns null for single events', () => {
    expect(describeRecurrence([{ block: block({ id: 'a', calendarRef: 'one@cal' }), verdict: 'new' }])).toBeNull();
  });
});

describe('validateSubscriptionUrl', () => {
  it.each([
    ['https://example.com/calendar.ics', true],
    ['  https://example.com/a.ics  ', true],
    ['http://example.com/calendar.ics', false],
    ['ftp://example.com/calendar.ics', false],
    ['https://user:pass@example.com/a.ics', false],
    ['not a url', false],
    ['', false],
  ])('%s -> %s', (raw, ok) => {
    expect(validateSubscriptionUrl(raw).ok).toBe(ok);
  });
});

describe('round-3: each pairing guard is load-bearing alone', () => {
  const DAY = 24 * 3600 * 1000;
  const WINDOW_FROM = new Date('2026-06-10T00:00:00Z');
  const WINDOW_TO = new Date('2027-06-10T00:00:00Z');
  const window = { from: WINDOW_FROM, to: WINDOW_TO };

  const occurrence = (id: string, when: Date, ref = 'series@x') =>
    block({ id, calendarRef: ref, start: when, end: new Date(when.getTime() + 30 * 60 * 1000), title: 'Physio' });

  it('WINDOW guard alone: a local occurrence just OUTSIDE the window does not pair even 1 day from the incoming', () => {
    const justOutside = new Date(WINDOW_FROM.getTime() - 60 * 60 * 1000); // 1h before window.from
    const incomingAt = new Date(WINDOW_FROM.getTime() + 60 * 60 * 1000); // 2h apart, inside the window
    const preview = buildImportPreview(
      [occurrence('a1', incomingAt)],
      [occurrence('local-1', justOutside)],
      window,
    );
    // Not paired: incoming is new, the historic local occurrence untouched.
    expect(preview.counts).toEqual({ new: 1, updated: 0, unchanged: 0, skipped: 0 });
    expect(preview.entries[0]!.block.id).toBe(uuid('a1'));
  });

  it('DISTANCE guard alone: two in-window occurrences 10 days apart do not pair', () => {
    const first = new Date('2026-06-20T09:00:00Z');
    const second = new Date('2026-06-30T09:00:00Z'); // both inside the window, 10 days apart
    const preview = buildImportPreview(
      [occurrence('a1', second)],
      [occurrence('local-1', first)],
      window,
    );
    expect(preview.counts).toEqual({ new: 1, updated: 0, unchanged: 0, skipped: 0 });
  });

  it('boundary: exactly 7 days apart pairs, 8 days does not', () => {
    const base = new Date('2026-06-20T09:00:00Z');
    const at7 = new Date(base.getTime() + 7 * DAY);
    const at8 = new Date(base.getTime() + 8 * DAY);
    const pairs = buildImportPreview([occurrence('a1', at7)], [occurrence('local-1', base)], window);
    expect(pairs.counts).toEqual({ new: 0, updated: 1, unchanged: 0, skipped: 0 });
    const noPair = buildImportPreview([occurrence('a2', at8)], [occurrence('local-2', base)], window);
    expect(noPair.counts).toEqual({ new: 1, updated: 0, unchanged: 0, skipped: 0 });
  });
});
