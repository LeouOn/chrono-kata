/**
 * Merge adds what is missing and changes nothing that is already here (Wave 18 part 2).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { COLLECTIONS } from '@/lib/data-transfer/collections';
import { parseEnvelope } from '@/lib/data-transfer/import';
import { applyMerge, planMerge } from '@/lib/data-transfer/merge';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset, makeRow, type Dataset } from './oracle/dataset';
import { backupTextOf, inZoneAsync, primaryKeys, readDb, seedDb, ZONES } from './oracle/harness';
import type { Row } from './oracle/tables';

beforeEach(async () => {
  await resetDbForTesting();
});

const SINGLE = ['streak', 'settings', 'llmSettings', 'tokens', 'pendingCalendarOps'];
const keys = () => primaryKeys();

/**
 * A device and a file that overlap the way two devices do:
 *  - row 0 of every collection is in both, identical;
 *  - row 1 is in both under the same key, with different content (the device's must be kept);
 *  - the rest of the file's rows are new to the device.
 */
function overlapping(seedDevice = 41, seedFile = 42) {
  const device = buildDataset(seedDevice, 'full', keys());
  // Two random datasets can share a key by chance (a week key, say). A merge test needs the file's "new"
  // rows to be new, so take the first file seed that shares none beyond the two rows made to overlap.
  let file = buildDataset(seedFile, 'full', keys());
  for (let seed = seedFile; seed < seedFile + 300; seed += 1) {
    file = buildDataset(seed, 'full', keys());
    const clash = COLLECTIONS.some(({ key }) => {
      const keyPath = keys()[key]!;
      const deviceKeys = new Set(device[key]!.map((r) => String(r[keyPath])));
      return file[key]!.some((r) => deviceKeys.has(String(r[keyPath])));
    });
    if (!clash) break;
    if (seed === seedFile + 299) throw new Error('no clash-free file seed found');
  }
  for (const { key } of COLLECTIONS) {
    const keyPath = keys()[key]!;
    file[key]![0] = { ...device[key]![0]! };
    file[key]![1] = { ...file[key]![1]!, [keyPath]: device[key]![1]![keyPath] };
  }
  return { device, file };
}

async function parse(file: Dataset, tweak?: (f: Record<string, unknown>) => void) {
  const parsed = parseEnvelope(backupTextOf(file, tweak));
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.skipped).toBe(0);
  return parsed.envelope;
}

describe('plan and apply', () => {
  it('the plan counts what would happen and writes nothing', async () => {
    const { device, file } = overlapping();
    await seedDb(device);
    const before = await readDb();
    const report = await planMerge(await parse(file));
    const after = await readDb();
    for (const table of Object.keys(before)) expect(diffTable(table, keys()[table]!, before[table]!, after[table]!)).toEqual([]);

    for (const c of report.collections) {
      const rows = file[c.key]!.length;
      expect(c, c.key).toEqual({ key: c.key, inFile: rows, added: rows - 2, same: 1, differs: 1 });
    }
    expect(report.collections.map((c) => c.key)).toEqual(COLLECTIONS.map((c) => c.key));
  });

  it('applying adds exactly the missing rows and leaves every row that was here exactly as it was', async () => {
    const { device, file } = overlapping();
    await seedDb(device);
    const report = await applyMerge(await parse(file));
    const after = await readDb();

    const problems: string[] = [];
    for (const { key } of COLLECTIONS) {
      const keyPath = keys()[key]!;
      const expected: Row[] = [...device[key]!, ...file[key]!.slice(2)]; // device rows, then the file's new ones
      problems.push(...diffTable(key, keyPath, expected, after[key]!));
      expect(report.collections.find((c) => c.key === key)!.added, key).toBe(file[key]!.length - 2);
    }
    for (const table of SINGLE) problems.push(...diffTable(table, keys()[table]!, device[table]!, after[table]!)); // singletons untouched
    expect(problems.join('\n')).toBe('');
  });

  it('the device\'s copy of a row that differs is the one kept', async () => {
    const { device, file } = overlapping();
    await seedDb(device);
    await applyMerge(await parse(file));
    const stored = await getDb().tasks.get(String(device.tasks![1]!.id));
    expect(JSON.stringify(stored)).toBe(JSON.stringify(device.tasks![1]));
    expect(JSON.stringify(stored)).not.toBe(JSON.stringify(file.tasks![1]));
  });

  it('merging the same file again adds nothing and changes nothing', async () => {
    const { device, file } = overlapping();
    await seedDb(device);
    const envelope = await parse(file);
    await applyMerge(envelope);
    const once = await readDb();
    const second = await applyMerge(envelope);
    const twice = await readDb();
    expect(second.collections.every((c) => c.added === 0)).toBe(true);
    for (const table of Object.keys(once)) expect(diffTable(table, keys()[table]!, once[table]!, twice[table]!)).toEqual([]);
  });

  it('merging into an empty device brings everything in, and a backup of that equals the file\'s data', async () => {
    const file = buildDataset(43, 'full', keys());
    await getDb().domains.clear();
    const report = await applyMerge(await parse(file));
    const after = await readDb();
    for (const { key } of COLLECTIONS) {
      expect(diffTable(key, keys()[key]!, file[key]!, after[key]!), key).toEqual([]);
      expect(report.collections.find((c) => c.key === key)).toMatchObject({ added: file[key]!.length, same: 0, differs: 0 });
    }
  });

  it('a kind the file does not carry is neither reported nor touched', async () => {
    const { device, file } = overlapping();
    await seedDb(device);
    const envelope = await parse(file, (f) => { delete f.estimates; delete f.reviews; });
    const report = await applyMerge(envelope);
    expect(report.collections.map((c) => c.key)).not.toContain('estimates');
    const after = await readDb();
    expect(diffTable('estimates', 'id', device.estimates!, after.estimates!)).toEqual([]);
  });

  it('the default life areas already on a fresh device are "already here", not duplicated', async () => {
    const file = buildDataset(44, 'full', keys());
    const seeded = await getDb().domains.toArray(); // the four defaults a fresh install holds
    expect(seeded.length).toBe(4);
    file.domains = [{ ...file.domains![0]!, id: seeded[0]!.id, name: 'Renamed in the file' }, ...file.domains!.slice(1)];
    await applyMerge(await parse(file));
    const after = await getDb().domains.toArray();
    expect(after.filter((d) => d.id === seeded[0]!.id)).toHaveLength(1);
    expect(after.find((d) => d.id === seeded[0]!.id)!.name).toBe(seeded[0]!.name);
  });
});

describe('derived habit logs', () => {
  it('a session-derived log the device already has for a (habit, session) pair is not added again under another id', async () => {
    const { device, file } = overlapping();
    // The same session on both devices; each derived its own log for it.
    const habit = device.habits![0]!;
    const session = device.sessions![0]!;
    device.habitLogs![0] = makeRow('habitLogs', 51, { habitId: habit.id, source: 'session', sessionId: session.id });
    file.habits![0] = habit;
    file.sessions![0] = session;
    file.habitLogs![0] = makeRow('habitLogs', 52, { habitId: habit.id, source: 'session', sessionId: session.id });
    expect(file.habitLogs![0]!.id).not.toBe(device.habitLogs![0]!.id);
    await seedDb(device);
    const report = await applyMerge(await parse(file));
    const logs = (await getDb().habitLogs.toArray()).filter((l) => l.habitId === habit.id && l.sessionId === session.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.id).toBe(device.habitLogs![0]!.id);
    expect(report.collections.find((c) => c.key === 'habitLogs')).toMatchObject({ added: file.habitLogs!.length - 2, same: 1, differs: 1 });
  });

  for (const zone of ZONES) {
    it(`a file from before habit logs: logs are derived for the sessions it adds, on the local day, and no existing log is touched (${zone})`, async () => {
      await inZoneAsync(zone, async () => {
        const habit = makeRow('habits', 61, { kind: 'timed', targetPerDay: 30, unit: undefined, linkedActivityLabel: 'Piano', linkedKataTemplateId: null, schedule: { kind: 'daily' }, archivedAt: null });
        const existingSession = makeRow('sessions', 62, { startedAt: new Date(2026, 0, 2, 9), durationMinutes: 10, reps: null, activityLabel: 'Piano' });
        await getDb().habits.put(habit as never);
        await getDb().sessions.put(existingSession as never);
        const existingLog = makeRow('habitLogs', 63, { habitId: habit.id, source: 'session', sessionId: existingSession.id, date: '2026-01-02', minutes: 10 });
        await getDb().habitLogs.put(existingLog as never);

        const lateEvening = new Date(new Date(2026, 2, 14).getTime() - 20 * 60_000);
        const added = makeRow('sessions', 64, { startedAt: lateEvening, durationMinutes: 25, reps: null, activityLabel: 'piano' });
        const text = JSON.stringify({ version: 2, exportedAt: '2026-10-24T12:00:00.000Z', sessions: [added], reflections: [], streak: null, settings: null, llmSettings: null });
        const parsed = parseEnvelope(text);
        if (!parsed.ok) throw new Error(parsed.error);
        await applyMerge(parsed.envelope);

        const logs = await getDb().habitLogs.toArray();
        expect(logs).toHaveLength(2);
        expect(logs.find((l) => l.id === existingLog.id)).toEqual(existingLog);
        const derived = logs.find((l) => l.sessionId === added.id)!;
        const y = lateEvening.getFullYear();
        const pad = (n: number) => String(n).padStart(2, '0');
        expect(derived.date).toBe(`${y}-${pad(lateEvening.getMonth() + 1)}-${pad(lateEvening.getDate())}`); // the local day
        expect(derived.minutes).toBe(25);
      });
    });
  }
});
