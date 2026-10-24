import { beforeEach, describe, expect, it } from 'vitest';
import { icsToBlocks } from '@/lib/ics/ics-import';
import { buildImportPreview } from '@/lib/ics/calendar-io';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { blockRepo } from '@/lib/db/block.repo';

/**
 * Brute-force oracle (lead's item 1): seeded random calendars through the
 * REAL importer + reconciler + repo, asserting the re-import invariants:
 *  (i)  import(X) twice  -> second preview has 0 writes, DB identical;
 *  (ii) import(X) then X' with one moved event -> exactly that row changes,
 *       nothing lost or duplicated;
 *  (iii) after import(X), rows == distinct occurrences in X.
 */

const NOW = new Date('2026-06-01T08:00:00Z');

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Generated {
  text: string;
  movedText: string | null;
  occurrenceCount: number;
}

function generateCalendar(rand: () => number): Generated {
  const eventCount = 1 + Math.floor(rand() * 4);
  const events: string[] = [];
  let occurrences = 0;
  let movedText: string | null = null;
  let movedArrayIndex = -1;

  for (let i = 0; i < eventCount; i++) {
    const uid = `evt-${i}${rand() < 0.3 ? '-clone' : ''}@probe`; // shared prefixes
    const day = 2 + Math.floor(rand() * 24);
    const hour = 7 + Math.floor(rand() * 11); // 7..17, so the move to T18 is always a real move
    const start = `202606${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}0000Z`;
    const end = `202606${String(day).padStart(2, '0')}T${String(hour + 1).padStart(2, '0')}3000Z`;
    if (rand() < 0.55) {
      occurrences += 1;
      const ev = ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260501T000000Z', `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:One-off ${i}`, 'END:VEVENT'].join('\r\n');
      events.push(ev);
      if (movedArrayIndex < 0) {
        movedArrayIndex = events.length - 1; // array position, not the loop counter
        movedText = ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260501T000000Z', `DTSTART:${start.replace(/T\d\d/, 'T18')}`, `DTEND:${end.replace(/T\d\d/, 'T19')}`, `SUMMARY:One-off ${i}`, 'END:VEVENT'].join('\r\n');
      }
    } else {
      const freq = rand() < 0.7 ? 'WEEKLY' : 'DAILY';
      const count = 2 + Math.floor(rand() * 5);
      occurrences += count;
      const ev = ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260501T000000Z', `DTSTART:${start}`, `DTEND:${end}`, `RRULE:FREQ=${freq};COUNT=${count}`, `SUMMARY:Series ${i}`, 'END:VEVENT'].join('\r\n');
      events.push(ev);
      if (rand() < 0.3) {
        // Move the first occurrence of this series via RECURRENCE-ID.
        const recDay = freq === 'WEEKLY' ? day : day;
        const recStart = `202606${String(recDay).padStart(2, '0')}T${String(hour).padStart(2, '0')}0000Z`;
        events.push(['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260501T000000Z', `RECURRENCE-ID:${recStart}`, `DTSTART:202606${String(recDay).padStart(2, '0')}T200000Z`, `DTEND:202606${String(recDay).padStart(2, '0')}T203000Z`, `SUMMARY:Series ${i} (moved)`, 'END:VEVENT'].join('\r\n'));
      }
    }
  }

  const wrap = (evs: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//oracle//EN', ...evs, 'END:VCALENDAR'].join('\r\n');
  const text = wrap(events);
  if (movedText && movedArrayIndex >= 0) {
    const moved = [...events];
    moved[movedArrayIndex] = movedText;
    return { text: wrap(events), movedText: wrap(moved), occurrenceCount: occurrences };
  }
  return { text, movedText: null, occurrenceCount: occurrences };
}

async function importOnce(text: string) {
  const imported = icsToBlocks(text, { now: NOW });
  const existing = await blockRepo.range(new Date('2026-01-01T00:00:00Z'), new Date('2027-12-31T00:00:00Z'));
  const preview = buildImportPreview(imported.blocks, existing);
  await blockRepo.applyCalendarImport(preview.toWrite);
  return preview;
}

const dbSnapshot = () =>
  getDb().blocks.toArray().then((rows) =>
    rows.map((b) => `${b.id}|${b.start.toISOString()}|${b.end.toISOString()}|${b.title}|${b.calendarRef ?? ''}`).sort(),
  );

describe('re-import oracle: seeded random calendars', () => {
  beforeEach(async () => { await resetDbForTesting(); });

  it('holds the invariants across 40 seeded calendars', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      await resetDbForTesting();
      const rand = mulberry32(seed);
      const { text, movedText } = generateCalendar(rand);

      // (iii) first import lands exactly the distinct occurrences.
      const first = await importOnce(text);
      const rowsAfterFirst = await dbSnapshot();
      expect(rowsAfterFirst.length, `seed ${seed}: rows should equal imported entries`).toBe(first.entries.length);

      // (i) re-importing the SAME file writes nothing and changes nothing.
      const second = await importOnce(text);
      const rowsAfterSecond = await dbSnapshot();
      expect(second.toWrite, `seed ${seed}: unchanged file must write 0 rows (counts ${JSON.stringify(second.counts)})`).toHaveLength(0);
      expect(rowsAfterSecond, `seed ${seed}: DB must be identical after re-import`).toEqual(rowsAfterFirst);

      // (ii) moving one event changes exactly one row, nothing lost/duplicated.
      if (movedText) {
        await importOnce(movedText);
        const rowsAfterMove = await dbSnapshot();
        expect(rowsAfterMove.length, `seed ${seed}: a moved event must not add or lose rows`).toBe(rowsAfterSecond.length);
        const changed = rowsAfterMove.filter((r) => !rowsAfterSecond.includes(r));
        expect(changed.length, `seed ${seed}: exactly one row changes on a move`).toBe(1);
      }
    }
  });
});
