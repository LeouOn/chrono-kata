/**
 * A seeded dataset that touches every table and (in `full` mode) every optional field, built from the
 * tables' own Zod schemas. Same seed and mode, same data.
 */
import type { ZodTypeAny } from 'zod';
import { gen, randomDayKey, ABSENT, type GenContext, type Mode, type Override } from './zod-gen';
import { seeded, type Rng } from './rng';
import { TABLE_SPECS, type Row, type TableSpec } from './tables';

export type Dataset = Record<string, Row[]>;

function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - back);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const OVERRIDES: Override[] = [
  // A week key is a local Monday: a refinement the generic string generator cannot see.
  { match: (path) => /\.weekOf$/.test(path), gen: ({ rng }) => mondayOf(randomDayKey(rng)) },
];

export function generateRow(
  table: string,
  spec: TableSpec,
  rng: Rng,
  mode: Mode,
  index: number,
): Row {
  let lastError = '';
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ctx: GenContext = { rng, mode, variant: index + attempt, path: table, overrides: OVERRIDES };
    let row = gen(spec.schema, ctx) as Row;
    if (row === (ABSENT as unknown)) throw new Error(`${table}: schema generated nothing`);
    if (spec.repair) row = spec.repair(row, index);
    const parsed = spec.schema.safeParse(row);
    if (parsed.success) return parsed.data as Row;
    lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  throw new Error(`oracle: could not generate a valid ${table} row in 80 tries (${lastError})`);
}

/** `keyPaths`: table name -> primary key field, read from Dexie by the caller (so it is the code's own). */
export function buildDataset(seed: number, mode: Mode, keyPaths: Record<string, string>): Dataset {
  const rng = seeded(seed);
  const data: Dataset = {};
  for (const [table, spec] of Object.entries(TABLE_SPECS)) {
    const key = keyPaths[table]!;
    const seen = new Set<string>();
    const rows: Row[] = [];
    let guard = 0;
    while (rows.length < spec.rows && guard < spec.rows * 20) {
      guard += 1;
      const row = generateRow(table, spec, rng, mode, rows.length);
      const id = String(row[key]);
      if (seen.has(id)) continue; // a week key can repeat; a primary key must not
      seen.add(id);
      rows.push(row);
    }
    if (rows.length < spec.rows) throw new Error(`oracle: could not make ${spec.rows} distinct ${table} rows`);
    data[table] = rows;
  }
  linkHabitLogs(data, rng);
  return data;
}

/**
 * Habit logs point at a habit and (when derived from a session) at that session. Import checks this
 * relationship, so the oracle's logs must be consistent the way the app's are.
 */
function linkHabitLogs(data: Dataset, rng: Rng): void {
  const habits = data.habits!;
  const sessions = data.sessions!;
  const used = new Set<string>();
  data.habitLogs = data.habitLogs!.map((log, i) => {
    const habit = habits[i % habits.length]!;
    let next: Row = { ...log, habitId: habit.id };
    if (next.source === 'session') {
      // One derived log per (habit, session).
      let session = sessions[rng.int(0, sessions.length - 1)]!;
      for (let tries = 0; used.has(`${habit.id}|${session.id}`) && tries < 40; tries += 1) {
        session = sessions[rng.int(0, sessions.length - 1)]!;
      }
      used.add(`${habit.id}|${session.id}`);
      next = { ...next, sessionId: session.id };
    }
    return next;
  });
}

export function schemaOf(table: string): ZodTypeAny {
  return TABLE_SPECS[table]!.schema;
}

/** One valid row of `table`, with some fields pinned: for tests that need a specific shape. */
export function makeRow(table: string, seed: number, overrides: Row = {}, mode: Mode = 'full'): Row {
  const spec = TABLE_SPECS[table]!;
  const base = generateRow(table, spec, seeded(seed), mode, 0);
  const row = { ...base, ...overrides };
  const parsed = spec.schema.safeParse(row);
  if (!parsed.success) throw new Error(`makeRow(${table}): ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  return parsed.data as Row;
}
