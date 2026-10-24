/**
 * Merge a backup INTO the data on this device.
 *
 * The rule is the cautious one, and it is the whole rule: **add what is missing, change nothing that
 * is already here.** A row whose key is on the device stays exactly as it is on the device, whether
 * or not the file's copy differs; the report counts those separately so the person can see how many
 * differed. Single-row records (settings, streak, AI settings) are never touched by a merge.
 * There is no "newest wins": two clocks disagree, and a merge that quietly overwrites an edit is
 * the failure a backup tool must not have.
 *
 * `planMerge` reads and counts; `applyMerge` does the same inside ONE transaction over every table
 * and writes. If any write throws, nothing was written.
 */
import type { IndexableType } from 'dexie';
import { getDb } from '@/lib/db/db';
import { syncHabitLogsForSession } from '@/lib/habits/session-sync';
import { COLLECTIONS, type CollectionKey } from './collections';
import type { ExportEnvelope } from './types';

export interface CollectionMergeReport {
  key: CollectionKey;
  /** Rows of this kind the file carries. */
  inFile: number;
  /** Rows added to this device. */
  added: number;
  /** Rows already here and identical. */
  same: number;
  /** Rows already here that differ from the file's copy: the device's copy was kept. */
  differs: number;
}

export interface MergeReport {
  /** Only the collections the file carries, in the app's usual order. */
  collections: CollectionMergeReport[];
}

/** A stable text for a row: keys sorted, dates as ISO text, so two equal rows give equal text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

type Row = Record<string, unknown>;

async function run(envelope: ExportEnvelope, apply: boolean): Promise<MergeReport> {
  const db = getDb();
  return db.transaction(apply ? 'rw' : 'r', db.tables, async () => {
    const collections: CollectionMergeReport[] = [];
    const addedSessions: Row[] = [];

    // Session-derived habit logs: one per (habit, session). A file's log for a pair the device already
    // has a log for is the same fact under a different id, so it is not added a second time.
    const deviceSessionLogs = new Set<string>();
    if (envelope.habitLogs !== undefined) {
      for (const log of await db.habitLogs.filter((l) => l.source === 'session').toArray()) {
        deviceSessionLogs.add(`${log.habitId}|${log.sessionId}`);
      }
    }

    for (const { key } of COLLECTIONS) {
      const rows = envelope[key] as Row[] | undefined;
      if (rows === undefined) continue; // the file does not carry this kind
      const table = db.table(key);
      const keyPath = table.schema.primKey.keyPath as string;
      const existing = (await table.bulkGet(rows.map((r) => r[keyPath] as IndexableType))) as (Row | undefined)[];

      const toAdd: Row[] = [];
      let same = 0;
      let differs = 0;
      rows.forEach((row, i) => {
        const here = existing[i];
        if (here === undefined && key === 'habitLogs' && row.source === 'session' && deviceSessionLogs.has(`${row.habitId}|${row.sessionId}`)) {
          same += 1; // the device already has this fact, recorded under its own id
        } else if (here === undefined) {
          toAdd.push(row);
        } else if (canonical(here) === canonical(row)) {
          same += 1;
        } else {
          differs += 1;
        }
      });

      if (apply && toAdd.length > 0) await table.bulkAdd(toAdd);
      if (key === 'sessions') addedSessions.push(...toAdd);
      collections.push({ key, inFile: rows.length, added: toAdd.length, same, differs });
    }

    // A file from before habit logs existed: derive them for the sessions that were just added.
    if (apply && envelope.habitLogs === undefined) {
      for (const session of addedSessions) await syncHabitLogsForSession(session as never);
    }
    return { collections };
  });
}

/** What a merge would do, without doing it. */
export function planMerge(envelope: ExportEnvelope): Promise<MergeReport> {
  return run(envelope, false);
}

/** Merge the file into this device, atomically. */
export function applyMerge(envelope: ExportEnvelope): Promise<MergeReport> {
  return run(envelope, true);
}
