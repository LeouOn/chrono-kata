/**
 * Automatic copies on this device (roadmap Wave 18 part 4), behind `taskInbox`.
 *
 * Rules, each one a bug class this project has already met:
 *  - "When was the last copy" has ONE source: the newest `madeAt` in the copies database. No second
 *    timestamp anywhere can disagree with it.
 *  - One automatic copy per LOCAL day, checked and written in a single transaction, so two open tabs cannot
 *    both make one.
 *  - A copy that cannot be made says so. It is never skipped quietly (the caller decides what to do).
 *  - Copies are compressed and kept within a count AND a size budget; the newest copy is never the one dropped.
 *  - A copy follows the plain-backup rule: no API keys, no sign-in, no calendar link.
 */
import { COLLECTIONS } from '@/lib/data-transfer/collections';
import { collectAll } from '@/lib/data-transfer/export';
import { deviceCounts } from '@/lib/data-transfer/preview';
import { newId } from '@/lib/utils/id';
import { toLocalDateString } from '@/lib/utils/date';
import { ERROR_STORAGE_KEY, KEEP_STORAGE_KEY, getCopiesDb, type CopyReason, type CopyRow } from './copies-db';
import { pack, unpack } from './pack';

export const KEEP_CHOICES = [3, 7, 14, 30] as const;
export const DEFAULT_KEEP = 7;
/** All copies together. A person's data compresses to a few MB; this is far above that and well below a phone's quota. */
export const MAX_COPIES_BYTES = 100 * 1024 * 1024;

export function getKeep(): number {
  try {
    const stored = Number(localStorage.getItem(KEEP_STORAGE_KEY));
    return (KEEP_CHOICES as readonly number[]).includes(stored) ? stored : DEFAULT_KEEP;
  } catch {
    return DEFAULT_KEEP;
  }
}

export function setKeep(count: number): boolean {
  if (!(KEEP_CHOICES as readonly number[]).includes(count)) return false;
  try {
    localStorage.setItem(KEEP_STORAGE_KEY, String(count));
    return true;
  } catch {
    return false;
  }
}

export interface CopyInfo {
  id: string;
  madeAt: Date;
  reason: CopyReason;
  counts: Record<string, number>;
  bytes: number;
}

const info = (row: CopyRow): CopyInfo => ({ id: row.id, madeAt: row.madeAt, reason: row.reason, counts: row.counts, bytes: row.bytes });

/** Newest first. Does not read any payload. */
export async function listCopies(): Promise<CopyInfo[]> {
  const rows = await getCopiesDb().copies.orderBy('madeAt').reverse().toArray();
  return rows.map(info);
}

/** When the newest copy was made, or null. This IS "the last copy": nothing else records it. */
export async function lastCopyAt(): Promise<Date | null> {
  const newest = await getCopiesDb().copies.orderBy('madeAt').last();
  return newest ? newest.madeAt : null;
}

/** The plain backup text of a copy, or null when it cannot be read back (it is then not offered for restore). */
export async function readCopyText(id: string): Promise<string | null> {
  const row = await getCopiesDb().copies.get(id);
  return row ? unpack(row.payload, row.encoding) : null;
}

export async function deleteCopy(id: string): Promise<void> {
  await getCopiesDb().copies.delete(id);
}

export type MakeResult =
  | { ok: true; copy: CopyInfo }
  | { ok: true; skipped: 'not-due' | 'no-data' }
  | { ok: false; why: 'storage-full' | 'unavailable' | 'failed'; message: string };

function failure(error: unknown): Extract<MakeResult, { ok: false }> {
  const name = error instanceof Error ? error.name : '';
  const text = error instanceof Error ? error.message : '';
  if (name === 'QuotaExceededError' || /quota|full/i.test(`${name} ${text}`)) {
    return { ok: false, why: 'storage-full', message: "There isn't room left on this device to keep another copy." };
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError' || typeof indexedDB === 'undefined') {
    return { ok: false, why: 'unavailable', message: "This browser isn't letting the app keep copies right now." };
  }
  return { ok: false, why: 'failed', message: 'A copy could not be made.' };
}

/** True when the device holds anything of the person's (the four default life areas do not count). */
export async function hasUserData(): Promise<boolean> {
  const counts = await deviceCounts();
  return COLLECTIONS.some(({ key }) => key !== 'domains' && counts[key] > 0);
}

/** Count rows per kind from the backup's own arrays. */
function countsOf(envelope: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    COLLECTIONS.flatMap(({ key }) => {
      const rows = envelope[key];
      return Array.isArray(rows) && rows.length > 0 ? [[key, rows.length]] : [];
    }),
  );
}

async function build(reason: CopyReason, now: Date): Promise<CopyRow> {
  const envelope = await collectAll();
  const packed = await pack(JSON.stringify(envelope));
  return {
    id: newId(),
    madeAt: now,
    reason,
    counts: countsOf(envelope as unknown as Record<string, unknown>),
    encoding: packed.encoding,
    bytes: packed.bytes.length,
    payload: packed.bytes,
  };
}

/** Keep the newest `keep` copies, then drop the oldest until the total fits `budget`. The newest is never dropped. */
export async function pruneCopies(keep = getKeep(), budget = MAX_COPIES_BYTES): Promise<number> {
  const db = getCopiesDb();
  return db.transaction('rw', db.copies, async () => {
    const rows = await db.copies.orderBy('madeAt').reverse().toArray(); // newest first
    const doomed: string[] = rows.slice(keep).map((r) => r.id);
    let kept = rows.slice(0, keep);
    let total = kept.reduce((n, r) => n + r.bytes, 0);
    while (total > budget && kept.length > 1) {
      const oldest = kept[kept.length - 1]!;
      doomed.push(oldest.id);
      total -= oldest.bytes;
      kept = kept.slice(0, -1);
    }
    await db.copies.bulkDelete(doomed);
    return doomed.length;
  });
}

function rememberError(message: string | null): void {
  try {
    if (message) localStorage.setItem(ERROR_STORAGE_KEY, message);
    else localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch {
    // nothing to remember it in
  }
}

/** The last automatic copy that could not be made, for the screen to say; null when the last try worked. */
export function lastCopyProblem(): string | null {
  try {
    return localStorage.getItem(ERROR_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Make a copy now (a manual one, or the one made just before an import). */
export async function makeCopy(reason: Exclude<CopyReason, 'daily'>, now = new Date()): Promise<MakeResult> {
  try {
    if (reason === 'before-import' && !(await hasUserData())) return { ok: true, skipped: 'no-data' };
    const row = await build(reason, now);
    await getCopiesDb().copies.add(row);
    await pruneCopies();
    rememberError(null);
    return { ok: true, copy: info(row) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * The automatic copy: at most one per local day, however many tabs ask at once.
 * The fast check avoids work on the common path; the decision that counts is made again INSIDE the one
 * transaction that writes, and IndexedDB serialises transactions on the same store across tabs.
 */
export async function makeDailyCopyIfDue(now = new Date()): Promise<MakeResult> {
  const today = toLocalDateString(now);
  const dueOutside = async () => {
    const last = await lastCopyAt();
    return last === null || toLocalDateString(last) !== today;
  };
  try {
    if (!(await dueOutside())) return { ok: true, skipped: 'not-due' };
    if (!(await hasUserData())) return { ok: true, skipped: 'no-data' };
    const row = await build('daily', now);
    const db = getCopiesDb();
    const written = await db.transaction('rw', db.copies, async () => {
      const newest = await db.copies.orderBy('madeAt').last();
      if (newest && toLocalDateString(newest.madeAt) === today) return false; // another tab got there first
      await db.copies.add(row);
      return true;
    });
    if (!written) return { ok: true, skipped: 'not-due' };
    await pruneCopies();
    rememberError(null);
    return { ok: true, copy: info(row) };
  } catch (e) {
    const failed = failure(e);
    rememberError(failed.message);
    return failed;
  }
}
