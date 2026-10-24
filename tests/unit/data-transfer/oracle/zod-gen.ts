/**
 * A generator of realistic rows FROM A ZOD SCHEMA.
 *
 * The point of deriving data from the schema, instead of writing fixtures by hand,
 * is that the field list is the schema's own: a field added to a schema next month
 * is populated, exported, imported and compared with no one remembering to update
 * a fixture. (A hand-written fixture is how `Project.breadcrumbAt` slipped through.)
 *
 * Two modes:
 *  - `full`:   every optional and nullable field is populated, so every field of the
 *              schema is exercised by every row.
 *  - `sparse`: optional fields are randomly absent and nullable ones randomly null, so
 *              "absent" and "null" must also survive a round trip as themselves.
 *
 * Enum values and union branches cycle with the row index (`variant`), so a few rows
 * visit all of them. The generator is STRICT: a construct it does not know throws with
 * the field path, rather than silently producing nothing for it.
 */
import type { ZodTypeAny } from 'zod';
import { hash, type Rng } from './rng';

export type Mode = 'full' | 'sparse';

export const ABSENT = Symbol('absent');

export interface GenContext {
  rng: Rng;
  mode: Mode;
  /** The row index: enum values and union branches cycle with it. */
  variant: number;
  /** Dotted path from the table name, e.g. "settings.wakingHours.start". */
  path: string;
  /** First matching override wins; use it for fields only a refinement or a format constrains. */
  overrides: readonly Override[];
}

export interface Override {
  match: (path: string) => boolean;
  gen: (ctx: GenContext) => unknown;
}

const TEXT_POOL = [
  'plain words',
  'quotes "double" and \'single\'',
  'a backslash \\ and a slash /',
  'line one\nline two',
  'tabs\tand  spaces',
  'accents: café, naïve, Ünïcode',
  '日本語のテキスト',
  'an emoji 🙂 and a symbol ✓',
  '<b>not html</b> & ampersand',
  '  leading and trailing  ',
  '100% sure; or maybe 3/4',
  '{"looks":"like json"}',
];

const DAY_MS = 86_400_000;
const EPOCH_MIN = Date.UTC(2025, 0, 1);
const EPOCH_MAX = Date.UTC(2027, 0, 1);

export function randomInstant(rng: Rng): Date {
  // Whole milliseconds, any time of day: ISO round trips must keep all of them.
  return new Date(EPOCH_MIN + Math.floor(rng.next() * (EPOCH_MAX - EPOCH_MIN)));
}

export function randomDayKey(rng: Rng): string {
  const d = new Date(EPOCH_MIN + Math.floor(rng.next() * ((EPOCH_MAX - EPOCH_MIN) / DAY_MS)) * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function randomUuid(rng: Rng): string {
  const hex = (n: number) => Array.from({ length: n }, () => rng.int(0, 15).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${rng.pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
}

function typeName(schema: ZodTypeAny): string {
  return (schema._def as { typeName: string }).typeName;
}

function cycle(ctx: GenContext, size: number): number {
  return (ctx.variant + hash(ctx.path)) % size;
}

/** A small JSON-safe value, for z.unknown() fields (which hold open-shaped data). */
function jsonValue(ctx: GenContext, depth = 0): unknown {
  const { rng } = ctx;
  const kinds = depth >= 2 ? 4 : 6;
  switch (rng.int(0, kinds - 1)) {
    case 0:
      return rng.pick(TEXT_POOL);
    case 1:
      return rng.int(-5, 500);
    case 2:
      return rng.chance(0.5);
    case 3:
      return null;
    case 4:
      return Array.from({ length: rng.int(1, 3) }, () => jsonValue(ctx, depth + 1));
    default:
      return Object.fromEntries(
        Array.from({ length: rng.int(1, 3) }, (_, i) => [`k${i}`, jsonValue(ctx, depth + 1)]),
      );
  }
}

const REGEXES: Record<string, (rng: Rng) => string> = {
  '^\\d{4}-\\d{2}-\\d{2}$': randomDayKey,
  '^([01]\\d|2[0-3]):[0-5]\\d$': (rng) => `${String(rng.int(0, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`,
  '^\\d{2}:\\d{2}$': (rng) => `${String(rng.int(0, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`,
  '^#[0-9a-fA-F]{6}$': (rng) => `#${Array.from({ length: 6 }, () => rng.int(0, 15).toString(16)).join('')}`,
};

type Check = { kind: string; value?: unknown; inclusive?: boolean; regex?: RegExp };

function genString(schema: ZodTypeAny, ctx: GenContext): string {
  const checks = ((schema._def as { checks: Check[] }).checks ?? []) as Check[];
  const has = (kind: string) => checks.find((c) => c.kind === kind);
  const min = (has('min')?.value as number | undefined) ?? (has('length')?.value as number | undefined) ?? 0;
  const max = (has('max')?.value as number | undefined) ?? (has('length')?.value as number | undefined) ?? 60;

  if (has('uuid')) return randomUuid(ctx.rng);
  const regex = has('regex')?.regex;
  if (regex) {
    const make = REGEXES[regex.source];
    if (!make) throw new Error(`zod-gen: no generator for regex ${regex.source} at ${ctx.path}; add one to REGEXES`);
    return make(ctx.rng);
  }
  const prefix = has('startsWith')?.value as string | undefined;
  if (has('url')) {
    const base = `${prefix ?? 'https://'}example.org/${ctx.rng.int(1000, 9999)}/path?x=${ctx.rng.int(1, 9)}`;
    return base.slice(0, max);
  }
  let text = ctx.rng.pick(TEXT_POOL);
  while (text.length < min) text += ` ${ctx.rng.pick(TEXT_POOL)}`;
  if (prefix) text = prefix + text;
  return text.length > max ? text.slice(0, max) : text;
}

function genNumber(schema: ZodTypeAny, ctx: GenContext): number {
  const checks = ((schema._def as { checks: Check[] }).checks ?? []) as Check[];
  const isInt = checks.some((c) => c.kind === 'int');
  let lo = 0;
  let hi = 1000;
  for (const check of checks) {
    if (check.kind === 'min') lo = (check.value as number) + (check.inclusive === false ? (isInt ? 1 : 0.5) : 0);
    if (check.kind === 'max') hi = (check.value as number) - (check.inclusive === false ? (isInt ? 1 : 0.5) : 0);
  }
  if (hi < lo) hi = lo;
  if (isInt) return ctx.rng.int(Math.ceil(lo), Math.floor(hi));
  // A non-integer with a few decimals: JSON must keep it exactly.
  return Math.round((lo + ctx.rng.next() * (hi - lo)) * 100) / 100;
}

export function gen(schema: ZodTypeAny, ctx: GenContext): unknown {
  for (const override of ctx.overrides) {
    if (override.match(ctx.path)) return override.gen(ctx);
  }
  const { rng } = ctx;
  const child = (key: string, c: ZodTypeAny) => gen(c, { ...ctx, path: `${ctx.path}.${key}` });

  switch (typeName(schema)) {
    case 'ZodOptional': {
      if (ctx.mode === 'sparse' && rng.chance(0.35)) return ABSENT;
      return gen((schema._def as { innerType: ZodTypeAny }).innerType, ctx);
    }
    case 'ZodNullable': {
      if (ctx.mode === 'sparse' && rng.chance(0.25)) return null;
      return gen((schema._def as { innerType: ZodTypeAny }).innerType, ctx);
    }
    case 'ZodDefault':
      return gen((schema._def as { innerType: ZodTypeAny }).innerType, ctx);
    case 'ZodEffects':
      return gen((schema._def as { schema: ZodTypeAny }).schema, ctx);
    case 'ZodObject': {
      const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(shape)) {
        const value = child(key, inner);
        if (value !== ABSENT) out[key] = value;
      }
      return out;
    }
    case 'ZodString':
      return genString(schema, ctx);
    case 'ZodNumber':
      return genNumber(schema, ctx);
    case 'ZodBoolean':
      return (ctx.variant + hash(ctx.path)) % 2 === 0;
    case 'ZodDate':
      return randomInstant(rng);
    case 'ZodEnum': {
      const values = (schema._def as { values: string[] }).values;
      return values[cycle(ctx, values.length)];
    }
    case 'ZodLiteral':
      return (schema._def as { value: unknown }).value;
    case 'ZodNull':
      return null;
    case 'ZodUnknown':
    case 'ZodAny':
      return jsonValue(ctx);
    case 'ZodArray': {
      const def = schema._def as {
        type: ZodTypeAny;
        minLength: { value: number } | null;
        maxLength: { value: number } | null;
        exactLength: { value: number } | null;
      };
      const exact = def.exactLength?.value;
      const min = exact ?? def.minLength?.value ?? 1;
      const max = exact ?? def.maxLength?.value ?? Math.max(min, 3);
      const length = rng.int(Math.max(1, min), Math.max(1, Math.min(max, 3)));
      return Array.from({ length }, (_, i) => gen(def.type, { ...ctx, path: `${ctx.path}[]`, variant: ctx.variant + i }));
    }
    case 'ZodRecord': {
      const def = schema._def as { keyType: ZodTypeAny; valueType: ZodTypeAny };
      // Enum keys: a different half of the values per row. Other keys come from the key schema itself
      // (a uuid for the review intentions), or are plain names when the key is any string.
      let keys: string[];
      if (typeName(def.keyType) === 'ZodEnum') {
        keys = (def.keyType._def as { values: string[] }).values.filter((_, i) => i % 2 === ctx.variant % 2).slice(0, 3);
      } else {
        const keyCtx = { ...ctx, path: `${ctx.path}{key}`, mode: 'full' as Mode };
        const constrained = ((def.keyType._def as { checks?: Check[] }).checks ?? []).length > 0;
        keys = Array.from({ length: rng.int(1, 3) }, (_, i) =>
          constrained ? String(gen(def.keyType, keyCtx)) : `k${ctx.variant}-${i}`,
        );
      }
      if (keys.length === 0) keys = [String((def.keyType._def as { values: string[] }).values[0])];
      return Object.fromEntries(keys.map((key) => [key, gen(def.valueType, { ...ctx, path: `${ctx.path}{}` })]));
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = (schema as unknown as { options: ZodTypeAny[] }).options;
      return gen(options[cycle(ctx, options.length)]!, ctx);
    }
    default:
      throw new Error(`zod-gen: unsupported schema construct ${typeName(schema)} at ${ctx.path}`);
  }
}

/** Every leaf field path a schema declares (arrays as `[]`, records as `{}`), for coverage checks. */
export function leafPaths(schema: ZodTypeAny, prefix: string): string[] {
  switch (typeName(schema)) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return leafPaths((schema._def as { innerType: ZodTypeAny }).innerType, prefix);
    case 'ZodEffects':
      return leafPaths((schema._def as { schema: ZodTypeAny }).schema, prefix);
    case 'ZodObject': {
      const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
      return Object.entries(shape).flatMap(([key, inner]) => leafPaths(inner, `${prefix}.${key}`));
    }
    case 'ZodArray':
      return leafPaths((schema._def as { type: ZodTypeAny }).type, `${prefix}[]`);
    case 'ZodRecord':
      return leafPaths((schema._def as { valueType: ZodTypeAny }).valueType, `${prefix}{}`);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      return (schema as unknown as { options: ZodTypeAny[] }).options.flatMap((option) => leafPaths(option, prefix));
    default:
      return [prefix];
  }
}

function tokens(path: string): string[] {
  // "table.a.b[].c{}.d" -> ["a", "b", "[]", "c", "{}", "d"]
  return path
    .split('.')
    .slice(1)
    .flatMap((segment) => {
      const out: string[] = [];
      let rest = segment;
      while (rest.endsWith('[]') || rest.endsWith('{}')) {
        out.unshift(rest.slice(-2));
        rest = rest.slice(0, -2);
      }
      if (rest) out.unshift(rest);
      return out;
    });
}

function hasAt(value: unknown, parts: string[]): boolean {
  if (parts.length === 0) return value !== undefined && value !== null;
  if (value === null || value === undefined) return false;
  const [head, ...tail] = parts;
  if (head === '[]') return Array.isArray(value) && value.some((item) => hasAt(item, tail));
  if (head === '{}') {
    return typeof value === 'object' && Object.values(value as Record<string, unknown>).some((item) => hasAt(item, tail));
  }
  return typeof value === 'object' && hasAt((value as Record<string, unknown>)[head!], tail);
}

/** True when some row holds a defined, non-null value at `path` (spelled as leafPaths spells it). */
export function rowsCover(rows: readonly unknown[], path: string): boolean {
  const parts = tokens(path);
  return rows.some((row) => hasAt(row, parts));
}
