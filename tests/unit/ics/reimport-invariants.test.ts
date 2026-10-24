import { beforeEach, describe, expect, it } from 'vitest';
import { icsToBlocks } from '@/lib/ics/ics-import';
import { blocksToIcs } from '@/lib/ics/ics-export';
import { buildImportPreview } from '@/lib/ics/calendar-io';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { blockRepo } from '@/lib/db/block.repo';

/**
 * Permanent versions of the lead's review probes for PR #44 (blocking items
 * 1-3): re-import idempotence for series, hand-made id collisions with our own
 * exports, and local links surviving re-import.
 */

const NOW = new Date('2026-06-01T08:00:00Z');
const ics = (events: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//probe//EN', events, 'END:VCALENDAR'].join('\r\n');
const WEEKLY = ['BEGIN:VEVENT', 'UID:weekly-standup@probe', 'DTSTAMP:20260501T000000Z', 'DTSTART:20260603T090000Z', 'DTEND:20260603T093000Z', 'RRULE:FREQ=WEEKLY;COUNT=4', 'SUMMARY:Weekly standup', 'END:VEVENT'].join('\r\n');
const ONEOFF = ['BEGIN:VEVENT', 'UID:dentist@probe', 'DTSTAMP:20260501T000000Z', 'DTSTART:20260604T130000Z', 'DTEND:20260604T140000Z', 'SUMMARY:Dentist', 'END:VEVENT'].join('\r\n');
const OVERRIDE = [WEEKLY, ['BEGIN:VEVENT', 'UID:weekly-standup@probe', 'DTSTAMP:20260501T000000Z', 'RECURRENCE-ID:20260610T090000Z', 'DTSTART:20260610T150000Z', 'DTEND:20260610T153000Z', 'SUMMARY:Weekly standup (moved)', 'END:VEVENT'].join('\r\n')].join('\r\n');

beforeEach(async () => { await resetDbForTesting(); });

const fmt = (b: { start: Date; title: string }) => `${b.start.toISOString().slice(5, 16)} ${b.title}`;

async function importOnce(text: string) {
  const imported = icsToBlocks(text, { now: NOW });
  const existing = await blockRepo.range(new Date('2026-01-01T00:00:00Z'), new Date('2027-12-31T00:00:00Z'));
  const preview = buildImportPreview(imported.blocks, existing);
  await blockRepo.applyCalendarImport(preview.toWrite);
  return { imported, preview };
}

describe('re-import idempotence (lead probe 1)', () => {
  for (const [name, text] of [['weekly x4 + one-off', ics(`${WEEKLY}\r\n${ONEOFF}`)], ['weekly with a moved occurrence', ics(OVERRIDE)]] as const) {
    it(`${name}: importing the same file twice changes nothing the second time`, async () => {
      await importOnce(text);
      const afterFirst = (await getDb().blocks.toArray()).map(fmt).sort();
      const second = await importOnce(text);
      const afterSecond = (await getDb().blocks.toArray()).map(fmt).sort();
      expect(second.preview.toWrite).toHaveLength(0);
      expect(second.preview.counts).toEqual({ new: 0, updated: 0, unchanged: afterFirst.length, skipped: 0 });
      expect(afterSecond).toEqual(afterFirst);
    });
  }
});

describe('hand-made blocks vs our own export (lead probe 2)', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 5, 3, h));

  it('re-importing an export of a block you edited afterwards never overwrites the edit', async () => {
    const dentist = await blockRepo.create({ start: t(10), end: t(11), kind: 'fixed', title: 'Dentist' });
    const text = blocksToIcs(await blockRepo.getAll(), { now: NOW });
    await blockRepo.update(dentist.id, { start: t(14), end: t(15) }); // user moves it AFTER exporting

    const imported = icsToBlocks(text, { now: NOW });
    const preview = buildImportPreview(imported.blocks, await blockRepo.getAll());
    await blockRepo.applyCalendarImport(preview.toWrite);

    const after = await getDb().blocks.get(dentist.id);
    expect(after?.start.toISOString().slice(11, 16)).toBe('14:00'); // the edit survived
    expect(preview.counts.skipped).toBe(1); // and the collision was shown, not silent
    expect(preview.skipped[0]!.reason).toBe('already in your app');
  });

  it('the repo backstop aborts the whole import on an id collision', async () => {
    const handmade = await blockRepo.create({ start: t(10), end: t(11), kind: 'fixed', title: 'Mine' });
    const attacker = {
      ...handmade,
      title: 'From a calendar',
      calendarRef: 'someone-else@cal',
    };
    await expect(blockRepo.applyCalendarImport([attacker])).rejects.toThrow(/collides/);
    const after = await getDb().blocks.get(handmade.id);
    expect(after?.title).toBe('Mine');
  });
});

describe('local links survive re-import (lead probe 3)', () => {
  it('a task linked to an imported block survives re-importing an unchanged calendar', async () => {
    await importOnce(ics(ONEOFF));
    const [row] = await getDb().blocks.toArray();
    const taskId = '11111111-1111-4111-8111-111111111111';
    await blockRepo.update(row!.id, { taskId });

    const second = await importOnce(ics(ONEOFF));
    expect(second.preview.counts).toEqual({ new: 0, updated: 0, unchanged: 1, skipped: 0 });
    const [after] = await getDb().blocks.toArray();
    expect(after?.taskId ?? null).toBe(taskId);
  });

  it('a moved event still updates while keeping the link', async () => {
    await importOnce(ics(ONEOFF));
    const [row] = await getDb().blocks.toArray();
    const taskId = '11111111-1111-4111-8111-111111111111';
    await blockRepo.update(row!.id, { taskId });

    const MOVED = ONEOFF.replace('20260604T130000Z', '20260604T153000Z').replace('20260604T140000Z', '20260604T163000Z');
    const second = await importOnce(ics(MOVED));
    expect(second.preview.counts).toEqual({ new: 0, updated: 1, unchanged: 0, skipped: 0 });
    const [after] = await getDb().blocks.toArray();
    expect(after?.taskId ?? null).toBe(taskId);
    expect(after?.start.toISOString().slice(11, 16)).toBe('15:30');
  });
});
