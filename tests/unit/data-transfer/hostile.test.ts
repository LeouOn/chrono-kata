/**
 * A file that is not a backup, or is built to hurt, is refused calmly and writes nothing (Wave 18 part 2).
 *
 * `parseEnvelope` never touches the database, so "writes nothing" is shown the straightforward way: every
 * refusal is followed by a full comparison of the database with what it held before.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_BACKUP_CHARS, MAX_ROWS_PER_COLLECTION } from '@/lib/data-transfer/guard';
import { parseEnvelope } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset } from './oracle/dataset';
import { backupTextOf, primaryKeys, readDb, seedDb } from './oracle/harness';

beforeEach(async () => {
  await resetDbForTesting();
});

const GOOD = () => buildDataset(71, 'full', primaryKeys());

async function expectRefused(text: string, why: RegExp | null = null) {
  await seedDb(GOOD());
  const before = await readDb();
  const result = parseEnvelope(text);
  expect(result.ok, 'the file should be refused').toBe(false);
  if (result.ok) return;
  if (why) expect(result.error).toMatch(why);
  expect(result.error.length).toBeGreaterThan(5);
  const after = await readDb();
  for (const table of Object.keys(before)) expect(diffTable(table, primaryKeys()[table]!, before[table]!, after[table]!)).toEqual([]);
}

describe('not a backup at all', () => {
  const NOT_BACKUPS: [string, string][] = [
    ['empty', ''],
    ['whitespace', '   \n'],
    ['plain text', 'hello, this is my shopping list'],
    ['half a JSON object', '{"version":2,"sessions":['],
    ['a JSON array', '[]'],
    ['null', 'null'],
    ['a string', '"backup"'],
    ['a number', '12'],
    ['an object with nothing in it', '{}'],
    ['an unknown version', '{"version":3,"sessions":[]}'],
    ['a version that is text', '{"version":"2","sessions":[]}'],
    ['sessions that is an object', '{"version":2,"sessions":{}}'],
    ['sessions that is text', '{"version":2,"sessions":"all of them"}'],
    ['a collection that is not a list', '{"version":2,"sessions":[],"tasks":{"a":1}}'],
  ];
  for (const [name, text] of NOT_BACKUPS) {
    it(`refuses ${name}`, async () => {
      await expectRefused(text);
    });
  }

  it('never echoes what the file said (a malformed file\'s start can be private)', () => {
    const result = parseEnvelope('MY-PRIVATE-DIARY-LINE: today I felt {');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain('PRIVATE');
      expect(result.error).toBe("This file isn't valid JSON.");
    }
  });
});

describe('keys that must never be in a backup', () => {
  const base = () => JSON.parse(backupTextOf(GOOD())) as Record<string, unknown>;
  const POISONED: [string, (file: Record<string, unknown>) => string][] = [
    ['at the top', () => '{"version":2,"sessions":[],"__proto__":{"polluted":true}}'],
    ['inside a row', (f) => JSON.stringify(f).replace('"title"', '"__proto__":{"polluted":true},"title"')],
    ['inside a nested record', (f) => {
      (f.reviewDrafts as Record<string, unknown>[])[0]!.decisions = JSON.parse('{"__proto__":{"polluted":true}}');
      return JSON.stringify(f);
    }],
    ['deep inside a list of lists', (f) => {
      (f.tasks as unknown[]).push(JSON.parse('[[[[[[[[{"__proto__":{"polluted":true}}]]]]]]]]'));
      return JSON.stringify(f);
    }],
  ];
  for (const [where, build] of POISONED) {
    it(`refuses a file with __proto__ ${where}, and nothing is polluted`, async () => {
      await expectRefused(build(base()), /entries that a backup never has/);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    });
  }

  it('accepts `constructor` and `prototype` as ordinary text/keys, strips them from rows, and pollutes nothing', () => {
    const file = base();
    const task = (file.tasks as Record<string, unknown>[])[0]!;
    task.constructor = { prototype: { polluted: true } };
    task.prototype = { polluted: true };
    const result = parseEnvelope(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(Object.keys(result.envelope.tasks![0]!)).not.toContain('prototype');
    expect(Object.prototype.hasOwnProperty.call(result.envelope.tasks![0]!, 'constructor')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('too big', () => {
  it('refuses text longer than a backup can be, without reading it', async () => {
    await expectRefused('x'.repeat(MAX_BACKUP_CHARS + 1), /larger than a backup can be/);
  });

  it('refuses a collection with more rows than a backup can hold', async () => {
    const rows = new Array(MAX_ROWS_PER_COLLECTION + 1).fill(null);
    await expectRefused(JSON.stringify({ version: 2, sessions: [], tasks: rows }), /more tasks than a backup can hold/);
  });

  it('survives a file nested absurdly deep: no crash, the one "row" is skipped, nothing is kept', async () => {
    const depth = 300_000;
    const text = `{"version":2,"sessions":${'['.repeat(depth)}${']'.repeat(depth)}}`;
    await seedDb(GOOD());
    const before = await readDb();
    const started = Date.now();
    const result = parseEnvelope(text);
    expect(Date.now() - started, 'it must not hang').toBeLessThan(5000);
    if (result.ok) {
      expect(result.envelope.sessions).toEqual([]);
      expect(result.skipped).toBe(1);
    } // refused outright is as good: the engine may give up on this depth
    const after = await readDb();
    for (const table of Object.keys(before)) expect(diffTable(table, primaryKeys()[table]!, before[table]!, after[table]!)).toEqual([]);
  });

  it('skips a row with an enormous text field instead of storing it', () => {
    const file = JSON.parse(backupTextOf(GOOD())) as Record<string, unknown>;
    const tasks = file.tasks as Record<string, unknown>[];
    const count = tasks.length;
    tasks[0]!.title = 'x'.repeat(5_000_000);
    const result = parseEnvelope(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.envelope.tasks).toHaveLength(count - 1);
    expect(result.skipped).toBe(1);
  });
});

describe('rows of the wrong kind inside a good file', () => {
  it('skips and counts every row that is not a row, and keeps the good ones', () => {
    const data = GOOD();
    const text = backupTextOf(data, (f) => {
      (f.sessions as unknown[]).push(null, 7, 'x', [], true, { startedAt: 'yesterday' }, { id: 5 });
    });
    const result = parseEnvelope(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.envelope.sessions).toHaveLength(data.sessions!.length);
    expect(result.skipped).toBe(7);
  });

  it('skips sessions whose start cannot be read (they mean nothing without it), counted, none stored', () => {
    const data = GOOD();
    const text = backupTextOf(data, (f) => {
      for (const row of f.sessions as Record<string, unknown>[]) row.startedAt = ['not-a-date', 1e20, {}, '2026-13-45', ''][Math.floor(Math.random() * 5)];
    });
    const result = parseEnvelope(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.envelope.sessions).toEqual([]);
    expect(result.skipped).toBe(data.sessions!.length);
  });

  it('cannot be tricked into a task whose finish time contradicts its status', () => {
    const data = GOOD();
    const text = backupTextOf(data, (f) => {
      const open = (f.tasks as Record<string, unknown>[]).find((t) => t.status !== 'done')!;
      open.doneAt = '2026-05-05T10:00:00.000Z'; // a finish time on a task that is not done
    });
    const result = parseEnvelope(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toBe(1);
  });
});
