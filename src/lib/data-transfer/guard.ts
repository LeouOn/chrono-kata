/**
 * Refuse a file that cannot be a backup, before anything reads it into the database.
 *
 * A backup is the person's own file, but a file picker can be pointed at anything, and a restore is
 * the one moment the app writes a large amount of data it did not produce. These checks are cheap,
 * run before any row is looked at, and every refusal says calmly what was wrong and that nothing on
 * the device was changed.
 */

/** Characters (not bytes) of JSON text a backup may hold. About 64 MB: far beyond years of daily use. */
export const MAX_BACKUP_CHARS = 64 * 1024 * 1024;

/** Rows in any one collection. The busiest table (coach messages) is a fraction of this after years. */
export const MAX_ROWS_PER_COLLECTION = 250_000;

/** Nodes (values) the key scan will look at before it gives up and refuses the file. */
const MAX_SCAN_NODES = 20_000_000;

export type GuardResult = { ok: true } | { ok: false; error: string };

export function refuseIfTooLarge(textLength: number): GuardResult {
  return textLength > MAX_BACKUP_CHARS
    ? { ok: false, error: 'This file is larger than a backup can be, so it was not read.' }
    : { ok: true };
}

/**
 * Refuse a parsed file that carries a key no backup has ever written (`__proto__`), anywhere in it.
 * `JSON.parse` makes such a key an ordinary own property, and a later copy or merge of the object
 * could treat it as the object's prototype. Looking for it costs one pass; stripping it quietly
 * would hide that the file is not what it claims to be.
 */
export function refuseIfHostile(parsed: unknown): GuardResult {
  const stack: unknown[] = [parsed];
  let seen = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null) continue;
    seen += 1;
    if (seen > MAX_SCAN_NODES) {
      return { ok: false, error: 'This file is too large and too deeply nested to be a backup, so it was not read.' };
    }
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    for (const key of Object.keys(value)) {
      if (key === '__proto__') {
        return { ok: false, error: 'This file contains entries that a backup never has, so it was not read.' };
      }
      stack.push((value as Record<string, unknown>)[key]);
    }
  }
  return { ok: true };
}

/** Refuse a collection with an absurd number of rows. */
export function refuseIfTooManyRows(raw: Record<string, unknown>): GuardResult {
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.length > MAX_ROWS_PER_COLLECTION) {
      return { ok: false, error: `The file lists more ${name} than a backup can hold, so it was not read.` };
    }
  }
  return { ok: true };
}
