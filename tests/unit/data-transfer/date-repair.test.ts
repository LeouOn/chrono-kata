/**
 * An unreadable date beside irreplaceable writing costs the field, never the row (Wave 18 part 2).
 *
 * `dates.ts` gives every date of every table one of three rules (core / optional / stamp). These tests
 * pin the rule itself, then run it over EVERY field of the rule table, then prove the rule table is
 * complete by comparing it with the Zod schemas (so a date added to a schema without a rule fails here).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DATE_SPECS } from '@/lib/data-transfer/dates';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { buildDataset } from './oracle/dataset';
import { backupTextOf, primaryKeys } from './oracle/harness';
import { TABLE_SPECS } from './oracle/tables';
import { dateLeaves } from './oracle/zod-gen';

beforeEach(async () => {
  await resetDbForTesting();
});

const BAD_VALUES: unknown[] = ['not-a-date', '', '2026-13-45', 1e20, {}, [], true, '31 February'];

describe('the rule table covers exactly the dates the schemas declare', () => {
  for (const [table, spec] of Object.entries(DATE_SPECS)) {
    it(`${table}`, () => {
      const leaves = dateLeaves(TABLE_SPECS[table]!.schema, table);
      const nested = leaves.filter((leaf) => /[.[{].*[.[{]/.test(leaf.path.slice(table.length + 1)) || /[[{]/.test(leaf.path));
      expect(nested.map((l) => l.path), 'a nested date has no rule: dates.ts only repairs top-level fields').toEqual([]);

      const declared = new Map(leaves.map((leaf) => [leaf.path.slice(table.length + 1), leaf.required]));
      const ruled = new Map<string, string>();
      const s = spec as { core?: readonly string[]; optional?: readonly string[]; stamps?: readonly string[]; stampsWhen?: object };
      for (const f of s.core ?? []) ruled.set(f, 'core');
      for (const f of s.optional ?? []) ruled.set(f, 'optional');
      for (const f of s.stamps ?? []) ruled.set(f, 'stamp');

      expect([...ruled.keys()].sort(), 'rules for fields the schema does not have, or missing rules').toEqual([...declared.keys()].sort());
      for (const [field, kind] of ruled) {
        // Required in the schema: core or stamp. Optional in the schema: optional.
        expect(kind === 'optional', `${table}.${field}`).toBe(declared.get(field) === false);
      }
    });
  }

  it('every table the importer reads has a rule', () => {
    const tables = Object.keys(TABLE_SPECS).filter((t) => !['pendingCalendarOps', 'tokens'].includes(t));
    expect(Object.keys(DATE_SPECS).sort()).toEqual(tables.sort());
  });
});

describe('the reported case: a damaged shutdown time beside the day\'s journal', () => {
  const day = {
    version: 2,
    exportedAt: '2026-10-24T12:00:00.000Z',
    sessions: [],
    reflections: [],
    streak: null,
    settings: null,
    llmSettings: null,
    dayPlans: [
      {
        date: '2026-10-23',
        picks: [],
        capacityMin: 240,
        journal: 'my own words that I cannot retype',
        shutdownNote: 'good day',
        shutdownAt: 'not-a-date',
        createdAt: '2026-10-23T08:00:00.000Z',
        updatedAt: '2026-10-23T21:00:00.000Z',
      },
    ],
  };

  it('keeps the day and its journal, drops only the time, and counts a repair, not a skip', () => {
    const parsed = parseEnvelope(JSON.stringify(day));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.skipped).toBe(0);
    expect(parsed.repaired).toBe(1);
    expect(parsed.repairedBy).toEqual({ dayPlans: 1 });
    const plan = parsed.envelope.dayPlans![0]!;
    expect(plan.journal).toBe('my own words that I cannot retype');
    expect(plan.shutdownNote).toBe('good day');
    expect(plan.shutdownAt).toBeUndefined();
    expect(plan.createdAt).toEqual(new Date('2026-10-23T08:00:00.000Z'));
  });

  it('and the restored database holds it', async () => {
    const parsed = parseEnvelope(JSON.stringify(day));
    if (!parsed.ok) throw new Error(parsed.error);
    await replaceAll(parsed.envelope);
    const stored = await getDb().dayPlans.get('2026-10-23');
    expect(stored?.journal).toBe('my own words that I cannot retype');
    expect(stored?.shutdownAt ?? null).toBeNull();
  });
});

describe('every date field of every table, damaged one at a time', () => {
  const keys = primaryKeys();
  const data = buildDataset(909, 'full', keys);
  const COLLECTIONS = Object.keys(DATE_SPECS).filter((t) => !['streak', 'settings', 'llmSettings'].includes(t));

  /** A row of `table` whose damaged field matters (a done task for the done-only rule). */
  const rowFor = (table: string, field: string) => {
    const rows = data[table]!;
    if (table === 'tasks' && field === 'doneAt') return rows.find((r) => r.status === 'done')!;
    if (table === 'tasks') return rows.find((r) => r.status !== 'done')!;
    return rows[0]!;
  };

  for (const table of COLLECTIONS) {
    const spec = DATE_SPECS[table as keyof typeof DATE_SPECS] as unknown as { core?: string[]; optional?: string[]; stamps?: string[] };
    const fields = [
      ...(spec.core ?? []).map((f) => [f, 'core'] as const),
      ...(spec.optional ?? []).map((f) => [f, 'optional'] as const),
      ...(spec.stamps ?? []).map((f) => [f, 'stamp'] as const),
    ];
    for (const [field, listed] of fields) {
      // A done task's finish time is a stamp (the row is not valid without it); the not-done case is below.
      const kind = table === 'tasks' && field === 'doneAt' ? ('stamp' as const) : listed;
      for (const bad of [BAD_VALUES[0], BAD_VALUES[4]]) {
        it(`${table}.${field} (${kind}) = ${JSON.stringify(bad)}`, () => {
          const target = rowFor(table, field);
          const id = String(target[keys[table]!]);
          const text = backupTextOf(data, (file) => {
            const rows = file[table] as Record<string, unknown>[];
            const row = rows.find((r) => String(r[keys[table]!]) === id)!;
            row[field] = bad;
          });
          const parsed = parseEnvelope(text);
          if (!parsed.ok) throw new Error(parsed.error);
          const kept = (parsed.envelope as unknown as Record<string, Record<string, unknown>[]>)[table]!;
          const row = kept.find((r) => String(r[keys[table]!]) === id);

          if (kind === 'core') {
            expect(row, 'a row that means nothing without this date is skipped').toBeUndefined();
            expect(parsed.skipped).toBe(1);
            expect(parsed.repaired).toBe(0);
          } else {
            expect(row, 'the row is kept').toBeDefined();
            expect(parsed.skipped).toBe(0);
            expect(parsed.repaired).toBe(1);
            expect(parsed.repairedBy).toEqual({ [table]: 1 });
            if (kind === 'optional') expect(row![field]).toBeUndefined();
            else expect(row![field]).toBeInstanceOf(Date);
            // Everything else in the row is exactly what the file said.
            for (const [key, value] of Object.entries(target)) {
              if (key === field) continue;
              expect(JSON.stringify(row![key]), `${table}.${key}`).toBe(JSON.stringify(value));
            }
          }
        });
      }
    }
  }

  it('every other row in the table is untouched by one damaged row', () => {
    const text = backupTextOf(data, (file) => {
      (file.dayPlans as Record<string, unknown>[])[0]!.shutdownAt = 'not-a-date';
    });
    const parsed = parseEnvelope(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.dayPlans!.length).toBe(data.dayPlans!.length);
    expect(parsed.skipped).toBe(0);
  });
});

describe('what a repaired stamp becomes', () => {
  const task = (over: Record<string, unknown>) => ({
    id: '11111111-1111-4111-8111-111111111111', title: 'Fix the hose', status: 'next', source: 'manual',
    createdAt: '2026-05-01T09:00:00.000Z', touchedAt: '2026-05-03T09:00:00.000Z', ...over,
  });
  const parseTask = (row: Record<string, unknown>, exportedAt: unknown = '2026-10-24T12:00:00.000Z') => {
    const parsed = parseEnvelope(JSON.stringify({ version: 2, exportedAt, sessions: [], reflections: [], streak: null, settings: null, llmSettings: null, tasks: [row] }));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  };

  it('takes another readable time of the same row first', () => {
    expect(parseTask(task({ createdAt: 'x' })).envelope.tasks![0]!.createdAt).toEqual(new Date('2026-05-03T09:00:00.000Z')); // touchedAt
  });

  it('takes the time the backup was made when the row has no readable time at all', () => {
    const row = parseTask(task({ createdAt: 'x', touchedAt: 'y' })).envelope.tasks![0]!;
    expect(row.createdAt).toEqual(new Date('2026-10-24T12:00:00.000Z'));
    expect(row.touchedAt).toEqual(new Date('2026-10-24T12:00:00.000Z'));
  });

  it('takes the present time only when the backup\'s own time is also unreadable', () => {
    const before = Date.now();
    const row = parseTask(task({ createdAt: 'x', touchedAt: 'y' }), 'never').envelope.tasks![0]!;
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('a done task with an unreadable finish time keeps its finish, estimated by when it was last touched', () => {
    const parsed = parseTask(task({ status: 'done', doneAt: 'x' }));
    expect(parsed.envelope.tasks![0]!.status).toBe('done');
    expect(parsed.envelope.tasks![0]!.doneAt).toEqual(new Date('2026-05-03T09:00:00.000Z'));
    expect(parsed.repaired).toBe(1);
  });

  it('a task that is not done simply loses an unreadable finish time', () => {
    const parsed = parseTask(task({ doneAt: 'x' }));
    expect(parsed.envelope.tasks![0]!.doneAt).toBeUndefined();
    expect(parsed.repaired).toBe(1);
  });

  it('a missing required time is not "unreadable": the row is still skipped, as before', () => {
    const { createdAt: _gone, ...noStamp } = task({});
    const parsed = parseTask(noStamp);
    expect(parsed.envelope.tasks).toEqual([]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.repaired).toBe(0);
  });

  it('null stays null on an optional date and is never "repaired"', () => {
    const parsed = parseTask(task({ dueAt: null }));
    expect(parsed.envelope.tasks![0]!.dueAt).toBeNull();
    expect(parsed.repaired).toBe(0);
  });
});

describe('the single-row records', () => {
  const file = (over: (f: Record<string, unknown>) => Record<string, unknown>) => {
    const data = buildDataset(910, 'full', primaryKeys());
    const text = backupTextOf(data, (f) => Object.assign(f, over(f)));
    const parsed = parseEnvelope(text);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  };

  it('settings keep every setting when a connection time cannot be read', () => {
    const parsed = file((f) => ({ settings: { ...(f.settings as object), googleCalendarConnectedAt: 'x', lastStreakFreezeUsedAt: 'y' } }));
    expect(parsed.envelope.settings).not.toBeNull();
    expect(parsed.envelope.settings!.googleCalendarConnectedAt).toBeUndefined();
    expect(parsed.envelope.settings!.lastStreakFreezeUsedAt).toBeUndefined();
    expect(parsed.repairedBy.settings).toBe(1);
    expect(parsed.skipped).toBe(0);
  });

  it('the streak keeps its counts when its update time cannot be read', () => {
    const parsed = file((f) => ({ streak: { ...(f.streak as object), updatedAt: 'x' } }));
    expect(parsed.envelope.streak).not.toBeNull();
    expect(parsed.envelope.streak!.updatedAt).toEqual(new Date('2026-10-24T12:00:00.000Z'));
    expect(parsed.repairedBy.streak).toBe(1);
  });

  it('AI settings keep their providers when a time cannot be read', () => {
    const parsed = file((f) => ({ llmSettings: { ...(f.llmSettings as object), totalTokensResetAt: 'x' } }));
    expect(parsed.envelope.llmSettings).not.toBeNull();
    expect(parsed.repairedBy.llmSettings).toBe(1);
  });
});
