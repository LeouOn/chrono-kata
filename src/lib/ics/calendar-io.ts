import type { Block } from '@/lib/schemas/block';
import type { IcsSkipped } from '@/lib/ics/ics-import';

/**
 * Wave 8 part 2: pure reconciliation between imported calendar blocks and the
 * blocks already in the database. No UI, no Dexie — the confirm path writes
 * the returned plan in one transaction.
 *
 * The reconciliation key is `calendarRef` (the event UID), NOT the block id:
 * the wave-08 design note says a RECURRENCE-ID override imports with a fresh
 * id but the same calendarRef, so keying on id would duplicate moved events
 * while keying on calendarRef sees "the same event moved". Blocks without a
 * calendarRef were made by hand in the app and are never touched.
 */

/** Hard caps so a giant file cannot hang the WebView; calm copy in the UI. */
export const ICS_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ICS_MAX_EVENTS = 2000;

export type PreviewVerdict = 'new' | 'updated' | 'unchanged';

export interface PreviewEntry {
  block: Block;
  verdict: PreviewVerdict;
}

export interface ImportPreview {
  entries: PreviewEntry[];
  skipped: IcsSkipped[];
  /** Blocks to write on confirm (new + changed), already deduped by calendarRef. */
  toWrite: Block[];
  counts: { new: number; updated: number; unchanged: number; skipped: number };
}

function blocksEqual(a: Block, b: Block): boolean {
  return (
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.title === b.title &&
    a.kind === b.kind &&
    (a.taskId ?? null) === (b.taskId ?? null) &&
    (a.projectId ?? null) === (b.projectId ?? null)
  );
}

/**
 * Reconcile imported blocks (which all carry a calendarRef from icsToBlocks)
 * against existing blocks. An imported block whose calendarRef matches an
 * existing block UPDATES it in place (same id — the roadmap's two-way
 * mapping: re-importing never duplicates); a match on content alone is not
 * enough, and hand-made blocks (no calendarRef) are invisible to the import.
 */
export function buildImportPreview(imported: readonly Block[], existing: readonly Block[]): ImportPreview {
  const byCalendarRef = new Map<string, Block>();
  for (const block of existing) {
    if (block.calendarRef != null && !byCalendarRef.has(block.calendarRef)) {
      byCalendarRef.set(block.calendarRef, block);
    }
  }

  const entries: PreviewEntry[] = [];
  const toWrite: Block[] = [];
  const seenRefs = new Set<string>();
  let unchanged = 0;

  for (const incoming of imported) {
    const ref = incoming.calendarRef;
    if (ref == null) continue; // defensive: icsToBlocks always sets one
    // Two occurrences of the same series UID in one file (e.g. an override
    // plus its original) keep distinct derived ids; same ref AND same id
    // within one file would be a duplicate — first one wins.
    const dupKey = `${ref}\u0000${incoming.id}`;
    if (seenRefs.has(dupKey)) continue;
    seenRefs.add(dupKey);

    const current = byCalendarRef.get(ref);
    if (!current) {
      entries.push({ block: incoming, verdict: 'new' });
      toWrite.push(incoming);
      continue;
    }
    const merged: Block = {
      ...incoming,
      // Keep the local id so links from other rows stay valid.
      id: current.id,
      createdAt: current.createdAt,
    };
    if (blocksEqual(current, merged)) {
      entries.push({ block: merged, verdict: 'unchanged' });
      unchanged += 1;
    } else {
      entries.push({ block: merged, verdict: 'updated' });
      toWrite.push(merged);
    }
  }

  const skipped: IcsSkipped[] = [];
  return {
    entries,
    skipped,
    toWrite,
    counts: {
      new: entries.filter((e) => e.verdict === 'new').length,
      updated: entries.filter((e) => e.verdict === 'updated').length,
      unchanged,
      skipped: skipped.length,
    },
  };
}

/** Attach the importer's skip reasons to a preview without altering entries. */
export function withSkips(preview: ImportPreview, skipped: readonly IcsSkipped[]): ImportPreview {
  return { ...preview, skipped: [...skipped], counts: { ...preview.counts, skipped: skipped.length } };
}

/** Subscription URLs: https only (CSP connect-src), no credentials, bounded length. */
export function validateSubscriptionUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Enter an address first.' };
  if (trimmed.length > 500) return { ok: false, reason: 'That address is too long.' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That does not look like an address.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'Only https addresses can be fetched.' };
  if (parsed.username || parsed.password) return { ok: false, reason: 'Addresses with a login cannot be used.' };
  return { ok: true, url: parsed.toString() };
}

/** "repeats weekly: next 3 occurrences added" style summary for recurring events. */
export function describeRecurrence(entries: readonly PreviewEntry[]): string | null {
  const refs = new Map<string, number>();
  for (const { block } of entries) {
    if (block.calendarRef == null) continue;
    refs.set(block.calendarRef, (refs.get(block.calendarRef) ?? 0) + 1);
  }
  const recurring = [...refs.entries()].filter(([, count]) => count > 1);
  if (recurring.length === 0) return null;
  const [ref, count] = recurring[0]!;
  return `repeats: ${count} occurrences of ${ref.slice(0, 24)}…`;
}
