/**
 * The oracle's own instruments: a comparison that cannot see a difference, or a generator that stops
 * filling fields, would make the completeness oracle pass for the wrong reason.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { diffTable, diffValues } from './compare';
import { buildDataset } from './dataset';
import { primaryKeys } from './harness';
import { TABLE_SPECS } from './tables';
import { ABSENT, gen, leafPaths, rowsCover } from './zod-gen';
import { seeded } from './rng';

const diff = (a: unknown, b: unknown) => {
  const out: string[] = [];
  diffValues(a, b, 'row', out);
  return out;
};

describe('compare', () => {
  it('sees a date that moved by one millisecond', () => {
    expect(diff({ at: new Date(1000) }, { at: new Date(1001) })).toHaveLength(1);
    expect(diff({ at: new Date(1000) }, { at: new Date(1000) })).toEqual([]);
  });

  it('never accepts a string where a Date was', () => {
    expect(diff({ at: new Date(1000) }, { at: new Date(1000).toISOString() })).toHaveLength(1);
    expect(diff({ at: new Date(1000).toISOString() }, { at: new Date(1000) })).toHaveLength(1);
  });

  it('tells null from absent, and treats an undefined value as absent', () => {
    expect(diff({ a: null }, {})).toHaveLength(1);
    expect(diff({}, { a: null })).toHaveLength(1);
    expect(diff({ a: undefined }, {})).toEqual([]);
  });

  it('looks inside arrays and nested records, and notices length', () => {
    expect(diff({ n: { list: [1, 2, 3] } }, { n: { list: [1, 2, 4] } })).toEqual(['row.n.list[2]: expected 3, got 4']);
    expect(diff({ list: [1, 2] }, { list: [1, 2, 3] })).toHaveLength(1);
    expect(diff({ r: { a: 1 } }, { r: { a: 1, b: 2 } })).toHaveLength(1);
  });

  it('reports a missing row and an extra row', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    expect(diffTable('t', 'id', rows, [rows[0]!])).toEqual(['t[b]: row missing after restore']);
    expect(diffTable('t', 'id', [rows[0]!], rows)).toEqual(['t[b]: unexpected extra row']);
    expect(diffTable('t', 'id', rows, [...rows].reverse())).toEqual([]); // order does not matter
  });
});

describe('the generator', () => {
  const sample = (schema: z.ZodTypeAny, mode: 'full' | 'sparse', seed = 1) =>
    gen(schema, { rng: seeded(seed), mode, variant: 0, path: 't', overrides: [] });

  it('is deterministic for a seed and different for another', () => {
    const a = buildDataset(5, 'full', primaryKeys());
    const b = buildDataset(5, 'full', primaryKeys());
    const c = buildDataset(6, 'full', primaryKeys());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('fills every optional and nullable field in full mode, and drops some in sparse mode', () => {
    const schema = z.object({ a: z.string().optional(), b: z.number().nullable(), c: z.date().nullable().optional() });
    for (let seed = 1; seed < 30; seed += 1) {
      const full = sample(schema, 'full', seed) as Record<string, unknown>;
      expect(Object.keys(full).sort()).toEqual(['a', 'b', 'c']);
      expect(full.b).not.toBeNull();
    }
    const shapes = new Set(
      Array.from({ length: 60 }, (_, seed) => JSON.stringify(Object.keys(sample(schema, 'sparse', seed + 1) as object).sort())),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('refuses a schema construct it does not understand, naming the field', () => {
    expect(() => sample(z.object({ x: z.lazy(() => z.string()) }), 'full')).toThrow(/unsupported schema construct ZodLazy at t\.x/);
    expect(() => sample(z.object({ x: z.string().regex(/^[a-z]{3}$/) }), 'full')).toThrow(/no generator for regex .* at t\.x/);
  });

  it('cycles union branches and enum values with the row index', () => {
    const schema = z.object({ e: z.enum(['a', 'b', 'c']), u: z.union([z.literal(1), z.literal(2)]) });
    const seen = new Set<string>();
    for (let variant = 0; variant < 12; variant += 1) {
      const row = gen(schema, { rng: seeded(3), mode: 'full', variant, path: 't', overrides: [] }) as { e: string; u: number };
      seen.add(`${row.e}${row.u}`);
    }
    expect(new Set([...seen].map((s) => s[0])).size).toBe(3);
    expect(new Set([...seen].map((s) => s[1])).size).toBe(2);
  });

  it('is not ABSENT-leaking: a required field is never skipped', () => {
    expect(sample(z.string(), 'sparse')).not.toBe(ABSENT);
  });

  it('walks nested arrays, records and unions for coverage', () => {
    const schema = z.object({ list: z.array(z.object({ k: z.string(), opt: z.number().optional() })), map: z.record(z.object({ v: z.boolean() })) });
    expect(leafPaths(schema, 't').sort()).toEqual(['t.list[].k', 't.list[].opt', 't.map{}.v']);
    expect(rowsCover([{ list: [{ k: 'x' }], map: { a: { v: false } } }], 't.list[].opt')).toBe(false);
    expect(rowsCover([{ list: [{ k: 'x', opt: 3 }], map: {} }], 't.list[].opt')).toBe(true);
    expect(rowsCover([{ map: { a: { v: false } } }], 't.map{}.v')).toBe(true); // false is a value
  });
});

describe('the datasets', () => {
  it('give every table rows that its own schema accepts, with unique primary keys', () => {
    const keys = primaryKeys();
    for (const mode of ['full', 'sparse'] as const) {
      const data = buildDataset(77, mode, keys);
      for (const [table, spec] of Object.entries(TABLE_SPECS)) {
        const rows = data[table]!;
        expect(rows.length, table).toBe(spec.rows);
        expect(new Set(rows.map((r) => String(r[keys[table]!]))).size, `${table} keys`).toBe(rows.length);
        for (const row of rows) expect(spec.schema.safeParse(row).success, `${table} ${mode}`).toBe(true);
      }
    }
  });

  it('cover both shapes of a mutually exclusive pair (minutes OR reps; every habit kind)', () => {
    const data = buildDataset(78, 'full', primaryKeys());
    expect(new Set(data.sessions!.map((s) => (s.durationMinutes != null ? 'minutes' : 'reps')))).toEqual(new Set(['minutes', 'reps']));
    expect(new Set(data.habits!.map((h) => h.kind))).toEqual(new Set(['timed', 'boolean', 'count']));
  });
});
