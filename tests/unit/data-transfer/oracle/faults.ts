/**
 * Make the Nth write to the database throw, to prove a multi-table operation is all-or-nothing.
 *
 * The write methods are patched on the per-database Table prototype, which every table object (including
 * the transaction-scoped ones Dexie hands out inside `db.transaction`) inherits from, so no write made
 * during the operation escapes the count.
 */
import { getDb } from '@/lib/db/db';

const WRITE_METHODS = ['add', 'bulkAdd', 'put', 'bulkPut', 'delete', 'bulkDelete', 'clear', 'update', 'bulkUpdate'] as const;

export interface WriteFault {
  /** Writes attempted so far (the one that threw included). */
  count(): number;
  undo(): void;
}

/** `failAt` is 1-based. Omit it to only count. */
export function failNthWrite(failAt?: number): WriteFault {
  const proto = Object.getPrototypeOf(getDb().sessions) as Record<string, unknown>;
  const originals = new Map<string, unknown>();
  let count = 0;
  for (const name of WRITE_METHODS) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    originals.set(name, original);
    proto[name] = function patched(this: unknown, ...args: unknown[]) {
      count += 1;
      if (failAt !== undefined && count === failAt) return Promise.reject(new Error('disk full'));
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
  return {
    count: () => count,
    undo: () => {
      for (const [name, original] of originals) proto[name] = original;
    },
  };
}
