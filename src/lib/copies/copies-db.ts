/**
 * The automatic copies live in a database of their own, `chrono-kata-copies`, NOT in the app's.
 *
 * That is the point: it is not a table of `chrono-kata` (so the app's Dexie version does not move), it is
 * never part of an export (a copy inside every backup would double each backup), and the completeness
 * oracle's list of tables does not change. The one thing both databases share is the browser profile, which
 * is why the screen says plainly what copies are and are not for.
 */
import Dexie, { type Table } from 'dexie';

export const COPIES_DB_NAME = 'chrono-kata-copies';

export type CopyReason = 'daily' | 'before-import' | 'manual';

export interface CopyRow {
  id: string;
  /** When the copy was made. The newest one is the ONLY record of "when was the last copy". */
  madeAt: Date;
  reason: CopyReason;
  /** Rows per kind (collection key -> count), so the list can say what is in a copy without opening it. */
  counts: Record<string, number>;
  encoding: 'gzip' | 'none';
  /** Size of `payload`. */
  bytes: number;
  /** The plain backup text (no secrets), compressed when the browser can. */
  payload: Uint8Array;
}

class CopiesDB extends Dexie {
  copies!: Table<CopyRow, string>;

  constructor() {
    super(COPIES_DB_NAME);
    this.version(1).stores({ copies: 'id, madeAt' });
  }
}

let instance: CopiesDB | null = null;

export function getCopiesDb(): CopiesDB {
  if (!instance) instance = new CopiesDB();
  return instance;
}

/** Device-local choice of how many copies to keep. Not in the app's settings: it must not travel in a backup. */
export const KEEP_STORAGE_KEY = 'chrono-kata-copies-keep';
/** The last automatic copy that could not be made, to say so on the screen. Cleared by the next success. */
export const ERROR_STORAGE_KEY = 'chrono-kata-copies-error';

/** Delete every copy (Clear all data, and tests). Also forgets the device-local choices. */
export async function deleteAllCopies(): Promise<void> {
  if (instance) {
    instance.close();
    instance = null;
  }
  await Dexie.delete(COPIES_DB_NAME);
  try {
    localStorage.removeItem(KEEP_STORAGE_KEY);
    localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch {
    // storage may be blocked: there is then nothing to forget
  }
}
