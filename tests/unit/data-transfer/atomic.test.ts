/**
 * An import is all or nothing (Wave 18 part 2).
 *
 * For EVERY write an import makes, in turn, that write is made to throw; after each, every table must
 * be exactly what it was before the import started. A count pass first shows how many writes there are,
 * so the loop cannot quietly cover fewer than all of them.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMerge } from '@/lib/data-transfer/merge';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset, type Dataset } from './oracle/dataset';
import { failNthWrite } from './oracle/faults';
import { backupTextOf, primaryKeys, readDb, seedDb } from './oracle/harness';

beforeEach(async () => {
  await resetDbForTesting();
});

const keys = () => primaryKeys();

async function tablesDiffer(before: Dataset): Promise<string[]> {
  const after = await readDb();
  return Object.keys(before).flatMap((table) => diffTable(table, keys()[table]!, before[table]!, after[table] ?? []));
}

/** Device data + a file that overlaps it partly (same keys, different rows) and adds new rows. */
async function setup(legacy = false) {
  const device = buildDataset(31, 'full', keys());
  const file = buildDataset(32, 'full', keys());
  // Make the file overlap the device: its first row of every keyed table takes the device's key.
  for (const [table, rows] of Object.entries(file)) {
    if (['streak', 'settings', 'llmSettings', 'tokens', 'pendingCalendarOps'].includes(table)) continue;
    rows[0] = { ...rows[0]!, [keys()[table]!]: device[table]![0]![keys()[table]!] };
  }
  await seedDb(device);
  const text = backupTextOf(file, (f) => {
    if (legacy) { delete f.habits; delete f.habitLogs; }
  });
  const parsed = parseEnvelope(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return { device, envelope: parsed.envelope };
}

for (const [name, run] of [
  ['replace', (e: Parameters<typeof replaceAll>[0]) => replaceAll(e)],
  ['merge', (e: Parameters<typeof applyMerge>[0]) => applyMerge(e)],
] as const) {
  for (const legacy of [false, true]) {
    describe(`${name}${legacy ? ' (a file from before habit logs)' : ''}: the Nth write throws`, () => {
      it('every write, in turn, leaves the database exactly as it was', async () => {
        // 1. Count the writes of a clean run.
        const probe = await setup(legacy);
        const counter = failNthWrite();
        await run(probe.envelope);
        const total = counter.count();
        counter.undo();
        expect(total, 'the operation makes writes').toBeGreaterThan(5);

        // 2. For each N, a fresh device, and the Nth write fails.
        for (let n = 1; n <= total; n += 1) {
          await resetDbForTesting();
          const { device, envelope } = await setup(legacy);
          const before = await readDb();
          const fault = failNthWrite(n);
          let error: unknown;
          try {
            await run(envelope);
          } catch (e) {
            error = e;
          } finally {
            fault.undo();
          }
          expect(error, `write ${n} of ${total} failed but the operation reported success`).toBeInstanceOf(Error);
          expect((error as Error).message, `write ${n}`).toContain('disk full');
          const problems = await tablesDiffer(before);
          expect(problems.join('\n'), `after write ${n} of ${total} threw, the database changed`).toBe('');
          void device;
        }
      });

      it('the same operation without a fault does change the database (the loop above is not vacuous)', async () => {
        const { envelope } = await setup(legacy);
        const before = await readDb();
        await run(envelope);
        expect((await tablesDiffer(before)).length).toBeGreaterThan(0);
      });
    });
  }
}

describe('a real constraint failure inside the restore', () => {
  it('a file that repeats a key rolls the whole replace back', async () => {
    const { envelope } = await setup();
    const before = await readDb();
    const tasks = envelope.tasks!;
    const broken = { ...envelope, tasks: [...tasks, tasks[0]!] }; // bypasses the parser's de-duplication
    await expect(replaceAll(broken)).rejects.toThrow();
    expect((await tablesDiffer(before)).join('\n')).toBe('');
  });

  it('and so does a merge handed the same repeated key', async () => {
    const { envelope } = await setup();
    const before = await readDb();
    const sessions = envelope.sessions;
    const fresh = { ...sessions[sessions.length - 1]!, id: '99999999-9999-4999-8999-999999999999' };
    const broken = { ...envelope, sessions: [...sessions, fresh, fresh] };
    await expect(applyMerge(broken)).rejects.toThrow();
    expect((await tablesDiffer(before)).join('\n')).toBe('');
  });
});
