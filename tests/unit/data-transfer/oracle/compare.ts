/**
 * Row comparison for the oracle: reports every field path that differs, so a failure names the
 * field that was lost (`projects[3].breadcrumbAt`) instead of dumping two large objects.
 *
 * Dates compare by instant AND must be Dates on both sides (a string never equals a date). `null` is
 * different from absent; an `undefined` value counts as absent (JSON cannot hold one).
 */
import type { Row } from './tables';

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

export function diffValues(expected: unknown, actual: unknown, path: string, out: string[]): void {
  if (expected instanceof Date || actual instanceof Date) {
    if (!(expected instanceof Date && actual instanceof Date)) {
      out.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
    } else if (expected.getTime() !== actual.getTime()) {
      out.push(`${path}: expected ${expected.toISOString()}, got ${actual.toISOString()}`);
    }
    return;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
      return;
    }
    if (expected.length !== actual.length) out.push(`${path}: length ${expected.length} -> ${actual.length}`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i += 1) diffValues(expected[i], actual[i], `${path}[${i}]`, out);
    return;
  }
  if (isPlain(expected) || isPlain(actual)) {
    if (!isPlain(expected) || !isPlain(actual)) {
      out.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
      return;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) diffValues(expected[key], actual[key], `${path}.${key}`, out);
    return;
  }
  if (!Object.is(expected, actual)) out.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
}

function describe(value: unknown): string {
  if (value === undefined) return 'absent';
  if (value instanceof Date) return `Date(${value.toISOString()})`;
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 37)}...` : value);
  if (typeof value === 'object' && value !== null) return Array.isArray(value) ? 'array' : 'object';
  return String(value);
}

/** Rows of one table, matched by primary key, compared field by field. Returns the differences. */
export function diffTable(table: string, key: string, expected: readonly Row[], actual: readonly Row[]): string[] {
  const out: string[] = [];
  const byKey = new Map(actual.map((row) => [String(row[key]), row]));
  const expectedKeys = new Set(expected.map((row) => String(row[key])));
  for (const row of expected) {
    const id = String(row[key]);
    const found = byKey.get(id);
    if (!found) {
      out.push(`${table}[${id}]: row missing after restore`);
      continue;
    }
    diffValues(row, found, `${table}[${id}]`, out);
  }
  for (const row of actual) {
    if (!expectedKeys.has(String(row[key]))) out.push(`${table}[${String(row[key])}]: unexpected extra row`);
  }
  if (expected.length !== actual.length && out.length === 0) out.push(`${table}: ${expected.length} rows -> ${actual.length}`);
  return out;
}
