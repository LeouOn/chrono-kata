/**
 * Automatic copies (Wave 18 part 4): what a copy holds, how many are kept, the one source of truth for "the
 * last copy", one copy per local day however many tabs ask, and a copy that cannot be made says so.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { COPIES_DB_NAME, deleteAllCopies, getCopiesDb, KEEP_STORAGE_KEY, type CopyRow } from '@/lib/copies/copies-db';
import {
  DEFAULT_KEEP,
  KEEP_CHOICES,
  MAX_COPIES_BYTES,
  getKeep,
  hasUserData,
  lastCopyAt,
  lastCopyProblem,
  listCopies,
  makeCopy,
  makeDailyCopyIfDue,
  pruneCopies,
  readCopyText,
  setKeep,
} from '@/lib/copies/copies';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { diffTable } from '../data-transfer/oracle/compare';
import { buildDataset } from '../data-transfer/oracle/dataset';
import { SECRET, ZONES, expectedAfterPlainRestore, inZoneAsync, plantSecrets, primaryKeys, readDb, seedDb } from '../data-transfer/oracle/harness';
import { DST_WEEK_MONDAYS, intlDayKey, local } from '../planning/w10-helpers';
import { addDays } from '@/lib/pacing/days';

beforeEach(async () => {
  await resetDbForTesting();
  await deleteAllCopies();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

const keys = () => primaryKeys();

/** A copy row written directly, with a chosen time and size, for the rotation tests. */
async function put(madeAt: Date, bytes = 10): Promise<CopyRow> {
  const row: CopyRow = { id: `${madeAt.getTime()}-${bytes}`, madeAt, reason: 'daily', counts: {}, encoding: 'none', bytes, payload: new Uint8Array(bytes) };
  await getCopiesDb().copies.add(row);
  return row;
}

describe('what a copy holds', () => {
  it('everything the plain backup holds, and putting it back gives the same data (the oracle\'s datasets)', async () => {
    const data = buildDataset(501, 'full', keys());
    plantSecrets(data);
    await seedDb(data);
    const made = await makeCopy('manual');
    if (!made.ok || !('copy' in made)) throw new Error('no copy made');
    expect(made.copy.counts.tasks).toBe(data.tasks!.length);
    expect(made.copy.counts.sessions).toBe(data.sessions!.length);

    const text = await readCopyText(made.copy.id);
    expect(text).not.toBeNull();
    const parsed = parseEnvelope(text!);
    if (!parsed.ok) throw new Error(parsed.error);
    expect({ skipped: parsed.skipped, repaired: parsed.repaired }).toEqual({ skipped: 0, repaired: 0 });

    await resetDbForTesting();
    await replaceAll(parsed.envelope);
    const restored = await readDb();
    const problems: string[] = [];
    for (const [table, rows] of Object.entries(expectedAfterPlainRestore(data))) problems.push(...diffTable(table, keys()[table]!, rows, restored[table] ?? []));
    expect(problems.join('\n')).toBe('');
  });

  it('holds no secret (the plain rule), and is smaller than the text it came from', async () => {
    const data = buildDataset(502, 'full', keys());
    plantSecrets(data);
    await seedDb(data);
    const plain = JSON.stringify(await collectAll());
    const made = await makeCopy('manual');
    if (!made.ok || !('copy' in made)) throw new Error('no copy made');
    const text = (await readCopyText(made.copy.id))!;
    for (const secret of [SECRET.accessToken, SECRET.icsUrl, SECRET.apiKey('planted-browser')]) expect(text).not.toContain(secret);
    const row = (await getCopiesDb().copies.get(made.copy.id))!;
    expect(row.encoding).toBe('gzip');
    expect(row.bytes).toBeLessThan(plain.length * 0.7);
    expect(made.copy.bytes).toBe(row.bytes);
  });

  it('is stored uncompressed when the browser cannot compress, and still reads back', async () => {
    await seedDb(buildDataset(503, 'sparse', keys()));
    vi.stubGlobal('CompressionStream', undefined);
    try {
      const made = await makeCopy('manual');
      if (!made.ok || !('copy' in made)) throw new Error('no copy made');
      expect((await getCopiesDb().copies.get(made.copy.id))!.encoding).toBe('none');
      expect(parseEnvelope((await readCopyText(made.copy.id))!).ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a damaged copy reads back as nothing, not as an exception, and a browser that cannot decompress says the same', async () => {
    const row = await put(new Date());
    await getCopiesDb().copies.put({ ...row, encoding: 'gzip', payload: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) });
    expect(await readCopyText(row.id)).toBeNull();
    expect(await readCopyText('no-such-copy')).toBeNull();
    await seedDb(buildDataset(504, 'sparse', keys()));
    const made = await makeCopy('manual');
    if (!made.ok || !('copy' in made)) throw new Error('no copy made');
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      expect(await readCopyText(made.copy.id)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lives in a database of its own: the app\'s tables and its exports do not change', async () => {
    await seedDb(buildDataset(505, 'sparse', keys()));
    await makeCopy('manual');
    expect(getDb().tables.map((t) => t.name)).not.toContain('copies');
    expect(await Dexie.getDatabaseNames()).toEqual(expect.arrayContaining(['chrono-kata', COPIES_DB_NAME]));
    expect(Object.keys(await collectAll())).not.toContain('copies');
    expect(JSON.stringify(await collectAll())).not.toContain(COPIES_DB_NAME);
  });
});

describe('making a copy writes nothing to the app\'s data', () => {
  it('a device without settings, streak or AI-settings records gets none created by a copy, and the copy restores fine', async () => {
    const data = buildDataset(515, 'sparse', keys());
    for (const table of ['settings', 'streak', 'llmSettings', 'tokens', 'pendingCalendarOps']) delete (data as Record<string, unknown>)[table];
    // seed only what the person made
    const db = getDb();
    await db.domains.clear();
    for (const [table, rows] of Object.entries(data)) await db.table(table).bulkPut(rows);
    expect(await db.settings.count()).toBe(0);
    const before = await readDb();

    const made = await makeDailyCopyIfDue(new Date(2026, 5, 9, 9, 0));
    if (!made.ok || !('copy' in made)) throw new Error('no copy made');
    const after = await readDb();
    for (const t of Object.keys(before)) expect(diffTable(t, keys()[t]!, before[t]!, after[t]!), t).toEqual([]);
    expect(after.settings).toEqual([]);
    expect(after.streak).toEqual([]);
    expect(after.llmSettings).toEqual([]);

    const parsed = parseEnvelope((await readCopyText(made.copy.id))!);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.settings).toBeNull();
    expect(parsed.envelope.tasks!.length).toBe(data.tasks!.length);
    expect(parsed.skipped).toBe(0);
  });

  it('while saving a file the person asked for still creates the defaults it always did', async () => {
    await getDb().tasks.put(buildDataset(516, 'sparse', keys()).tasks![0] as never);
    expect(await getDb().settings.count()).toBe(0);
    const file = await collectAll();
    expect(file.settings).not.toBeNull();
    expect(await getDb().settings.count()).toBe(1);
  });
});

describe('how many are kept', () => {
  it('the newest N, 7 unless the person chose otherwise, from a choice of 3, 7, 14, 30', async () => {
    expect(getKeep()).toBe(DEFAULT_KEEP);
    expect(KEEP_CHOICES).toEqual([3, 7, 14, 30]);
    for (let i = 0; i < 12; i += 1) await put(new Date(2026, 5, 1 + i, 9, 0));
    expect(await pruneCopies()).toBe(5);
    const left = await listCopies();
    expect(left).toHaveLength(7);
    expect(left.map((c) => c.madeAt.getDate())).toEqual([12, 11, 10, 9, 8, 7, 6]); // newest first; the five oldest are gone
    expect(setKeep(3)).toBe(true);
    expect(await pruneCopies()).toBe(4);
    expect((await listCopies()).map((c) => c.madeAt.getDate())).toEqual([12, 11, 10]);
  });

  it('refuses a number that is not one of the choices, and ignores a stored one that is not', () => {
    expect(setKeep(5)).toBe(false);
    expect(setKeep(0)).toBe(false);
    localStorage.setItem(KEEP_STORAGE_KEY, '99999');
    expect(getKeep()).toBe(DEFAULT_KEEP);
    localStorage.setItem(KEEP_STORAGE_KEY, 'lots');
    expect(getKeep()).toBe(DEFAULT_KEEP);
  });

  it('stays within a size budget by dropping the OLDEST, and never drops the newest, even when it alone is over', async () => {
    for (let i = 0; i < 5; i += 1) await put(new Date(2026, 5, 1 + i, 9, 0), 100);
    await pruneCopies(7, 250);
    expect((await listCopies()).map((c) => c.madeAt.getDate())).toEqual([5, 4]);
    await pruneCopies(7, 10); // smaller than any one copy
    expect((await listCopies()).map((c) => c.madeAt.getDate())).toEqual([5]);
    expect(MAX_COPIES_BYTES).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('making a copy prunes: the 8th copy leaves seven', async () => {
    await seedDb(buildDataset(506, 'sparse', keys()));
    for (let i = 0; i < 8; i += 1) await makeCopy('manual', new Date(2026, 5, 1 + i, 9, 0));
    const left = await listCopies();
    expect(left).toHaveLength(7);
    expect(left[left.length - 1]!.madeAt.getDate()).toBe(2); // the first one went
  });
});

describe('"the last copy" has one source', () => {
  it('is the newest madeAt in the copies database, with no other record to disagree', async () => {
    expect(await lastCopyAt()).toBeNull();
    await put(new Date(2026, 5, 3, 9, 0));
    const newest = await put(new Date(2026, 5, 9, 18, 30));
    await put(new Date(2026, 5, 5, 12, 0));
    localStorage.clear(); // nothing there may matter
    expect(await lastCopyAt()).toEqual(newest.madeAt);
    await getCopiesDb().copies.delete(newest.id);
    expect(await lastCopyAt()).toEqual(new Date(2026, 5, 5, 12, 0)); // follows the data, not a note about it
  });

  it('is not written to localStorage or anywhere else when a copy is made', async () => {
    await seedDb(buildDataset(507, 'sparse', keys()));
    const when = new Date(2026, 5, 9, 18, 30);
    await makeCopy('manual', when);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)!;
      expect(`${key}=${localStorage.getItem(key)}`).not.toMatch(/2026|18:30|1[0-9]{12}/);
    }
  });

  it('stays right when two copies are deleted out of order', async () => {
    const a = await put(new Date(2026, 5, 1, 9, 0));
    await put(new Date(2026, 5, 2, 9, 0));
    const c = await put(new Date(2026, 5, 3, 9, 0));
    await getCopiesDb().copies.delete(a.id);
    expect(await lastCopyAt()).toEqual(c.madeAt);
  });
});

describe('one automatic copy per LOCAL day', () => {
  it('makes it, skips later calls the same day, and makes the next one the next day', async () => {
    await seedDb(buildDataset(508, 'sparse', keys()));
    const first = await makeDailyCopyIfDue(new Date(2026, 5, 9, 9, 0));
    expect(first).toMatchObject({ ok: true, copy: { reason: 'daily' } });
    expect(await makeDailyCopyIfDue(new Date(2026, 5, 9, 23, 59))).toEqual({ ok: true, skipped: 'not-due' });
    expect(await makeDailyCopyIfDue(new Date(2026, 5, 10, 0, 1))).toMatchObject({ ok: true, copy: { reason: 'daily' } });
    expect(await listCopies()).toHaveLength(2);
  });

  for (const zone of ZONES) {
    it(`a month around each clock change: exactly one copy per calendar day, on the day it was made (${zone})`, async () => {
      await inZoneAsync(zone, async () => {
        await seedDb(buildDataset(509, 'sparse', keys()));
        for (const monday of DST_WEEK_MONDAYS[zone]) {
          await deleteAllCopies();
          setKeep(14); // ten days of copies must all survive for this test to see them
          const start = addDays(monday, -3);
          const days = Array.from({ length: 10 }, (_, i) => addDays(start, i));
          for (const day of days) {
            for (const hour of [0.02, 3, 9, 14.5, 23.97]) await makeDailyCopyIfDue(local(day, hour));
          }
          const copies = (await listCopies()).reverse();
          expect(copies.map((c) => intlDayKey(c.madeAt, zone)), `${zone} around ${monday}`).toEqual(days);
        }
      });
    });
  }

  it('however many tabs ask at the same moment, one copy is made', async () => {
    await seedDb(buildDataset(510, 'full', keys()));
    const now = new Date(2026, 5, 9, 9, 0);
    const results = await Promise.all(Array.from({ length: 8 }, () => makeDailyCopyIfDue(now)));
    expect(results.filter((r) => r.ok && 'copy' in r)).toHaveLength(1);
    expect(results.filter((r) => r.ok && 'skipped' in r)).toHaveLength(7);
    expect(await listCopies()).toHaveLength(1);
  });

  it('makes none for a device that holds nothing of the person\'s (the four default life areas do not count)', async () => {
    expect(await hasUserData()).toBe(false);
    expect(await makeDailyCopyIfDue()).toEqual({ ok: true, skipped: 'no-data' });
    expect(await makeCopy('before-import')).toEqual({ ok: true, skipped: 'no-data' });
    expect(await listCopies()).toEqual([]);
    expect(await makeCopy('manual')).toMatchObject({ ok: true, copy: { reason: 'manual' } }); // asked for by name: made
  });
});

describe('a copy that cannot be made says so', () => {
  function failAdd(name: string, message = 'The quota has been exceeded.') {
    const db = getCopiesDb();
    return vi.spyOn(db.copies, 'add').mockRejectedValue(Object.assign(new Error(message), { name }));
  }

  it('storage full: the reason in plain words, nothing half-written, and the screen can show it later', async () => {
    await seedDb(buildDataset(511, 'sparse', keys()));
    failAdd('QuotaExceededError');
    const daily = await makeDailyCopyIfDue(new Date(2026, 5, 9, 9, 0));
    expect(daily).toEqual({ ok: false, why: 'storage-full', message: "There isn't room left on this device to keep another copy." });
    expect(lastCopyProblem()).toBe("There isn't room left on this device to keep another copy.");
    expect(await listCopies()).toEqual([]);
    vi.restoreAllMocks();
    expect(await makeDailyCopyIfDue(new Date(2026, 5, 9, 9, 5))).toMatchObject({ ok: true, copy: { reason: 'daily' } });
    expect(lastCopyProblem()).toBeNull(); // cleared by the next success
  });

  it('a manual or before-import copy that fails returns the failure to its caller', async () => {
    await seedDb(buildDataset(512, 'sparse', keys()));
    failAdd('QuotaExceededError');
    expect(await makeCopy('manual')).toMatchObject({ ok: false, why: 'storage-full' });
    expect(await makeCopy('before-import')).toMatchObject({ ok: false, why: 'storage-full' });
    vi.restoreAllMocks();
    failAdd('InvalidStateError', 'The database connection is closing.');
    expect(await makeCopy('manual')).toMatchObject({ ok: false, why: 'unavailable' });
    vi.restoreAllMocks();
    vi.spyOn(getCopiesDb().copies, 'add').mockRejectedValue(new Error('something odd'));
    expect(await makeCopy('manual')).toEqual({ ok: false, why: 'failed', message: 'A copy could not be made.' });
  });
});
