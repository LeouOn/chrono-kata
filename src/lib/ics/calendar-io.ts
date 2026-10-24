import type { Block } from '@/lib/schemas/block';
import { BlockSchema } from '@/lib/schemas/block';
import { IcsSubscriptionUrlSchema } from '@/lib/schemas/settings';
import type { IcsSkipped } from '@/lib/ics/ics-import';

/**
 * Wave 8 part 2: pure reconciliation between imported calendar blocks and the
 * blocks already in the database. No UI, no Dexie — the confirm path writes
 * the returned plan in one transaction.
 *
 * Matching happens in two passes, because a recurring event shares ONE
 * calendarRef (the UID) across many occurrence blocks:
 *
 * 1. **Occurrence identity (by id).** The importer derives a stable id per
 *    occurrence (UID + occurrence start), and our own exports carry
 *    `X-CHRONO-KATA-BLOCK-ID`. So the same occurrence imports with the same
 *    id, and an id match is an occurrence match. An incoming id that collides
 *    with an existing block WITHOUT a calendarRef is a block made by hand in
 *    the app (typically: importing your own export after editing the block) —
 *    it is reported as skipped, never silently overwritten.
 *
 * 2. **Calendar identity (by calendarRef, one-to-one).** For occurrences the
 *    file moved (a RECURRENCE-ID override imports with a fresh id; a one-off
 *    edited in the source calendar changes its derived id), the leftovers on
 *    both sides are grouped by calendarRef and paired one-to-one by nearest
 *    start time. A moved occurrence updates in place; it can never land on a
 *    sibling occurrence, because siblings have already matched by id in
 *    pass 1. Leftover incoming blocks (genuinely new occurrences) are new;
 *    leftover existing blocks (occurrences the file no longer contains) are
 *    left untouched — imports never delete.
 *
 * Fields the calendar owns (start, end, title, kind) are compared and updated;
 * fields only the app owns (taskId, projectId) are always kept from the local
 * block, so re-importing an unchanged calendar never unlinks a task.
 */

/** Hard caps so a giant file cannot hang the WebView; calm copy in the UI. */
export const ICS_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ICS_MAX_EVENTS = 2000;

export type PreviewVerdict = 'new' | 'updated' | 'unchanged';

export interface PreviewEntry {
  block: Block;
  verdict: PreviewVerdict;
}

export type PreviewSkipReason = 'already-in-app' | (IcsSkipped['reason'] extends string ? never : never) | string;

export interface ImportPreview {
  entries: PreviewEntry[];
  skipped: { summary?: string; reason: string }[];
  /** Blocks to write on confirm (new + changed), exactly what will be written. */
  toWrite: Block[];
  counts: { new: number; updated: number; unchanged: number; skipped: number };
}

/** Only the fields the calendar owns participate in equality/updates. */
function calendarEqual(a: Block, b: Block): boolean {
  return (
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime() &&
    a.title === b.title &&
    a.kind === b.kind
  );
}

/** Merge an incoming occurrence onto its local match: local-only fields survive. */
function mergeOnto(incoming: Block, current: Block): Block {
  return {
    ...incoming,
    id: current.id,
    createdAt: current.createdAt,
    // Local-only fields: the calendar never owns these.
    taskId: current.taskId ?? null,
    projectId: current.projectId ?? null,
  };
}

export function buildImportPreview(imported: readonly Block[], existing: readonly Block[]): ImportPreview {
  const entries: PreviewEntry[] = [];
  const skipped: { summary?: string; reason: string }[] = [];
  const toWrite: Block[] = [];

  const existingById = new Map(existing.map((b) => [b.id, b]));
  const matchedExisting = new Set<string>();
  const seenIncoming = new Set<string>();

  const classify = (incoming: Block, current: Block) => {
    const merged = mergeOnto(incoming, current);
    if (calendarEqual(current, merged)) {
      entries.push({ block: merged, verdict: 'unchanged' });
    } else {
      entries.push({ block: merged, verdict: 'updated' });
      toWrite.push(BlockSchema.parse(merged));
    }
  };

  // Pass 1: occurrence identity by id.
  const unmatchedByRef = new Map<string, Block[]>();
  for (const incoming of imported) {
    if (seenIncoming.has(incoming.id)) continue; // exact duplicate within the file
    seenIncoming.add(incoming.id);
    const current = existingById.get(incoming.id);
    if (!current) {
      const ref = incoming.calendarRef;
      if (ref != null) {
        const group = unmatchedByRef.get(ref) ?? [];
        group.push(incoming);
        unmatchedByRef.set(ref, group);
      } else {
        // Defensive: icsToBlocks always sets a calendarRef.
        entries.push({ block: incoming, verdict: 'new' });
        toWrite.push(BlockSchema.parse(incoming));
      }
      continue;
    }
    if (current.calendarRef == null) {
      // Id collision with a block made by hand in the app (e.g. our own
      // export re-imported after a local edit). Never overwrite silently.
      skipped.push({ summary: incoming.title, reason: 'already in your app' });
      continue;
    }
    matchedExisting.add(current.id);
    classify(incoming, current);
  }

  // Pass 2: calendar identity — pair leftover occurrences one-to-one by
  // nearest start time within each calendarRef group.
  const leftoverByRef = new Map<string, Block[]>();
  for (const block of existing) {
    if (matchedExisting.has(block.id)) continue;
    if (block.calendarRef == null) continue; // hand-made: invisible to imports
    const group = leftoverByRef.get(block.calendarRef) ?? [];
    group.push(block);
    leftoverByRef.set(block.calendarRef, group);
  }

  for (const [ref, incomingGroup] of unmatchedByRef) {
    const localGroup = leftoverByRef.get(ref) ?? [];
    for (const incoming of incomingGroup) {
      let best: Block | undefined;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const candidate of localGroup) {
        if (matchedExisting.has(candidate.id)) continue;
        const delta = Math.abs(candidate.start.getTime() - incoming.start.getTime());
        if (delta < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }
      if (best) {
        matchedExisting.add(best.id);
        classify(incoming, best);
      } else {
        entries.push({ block: incoming, verdict: 'new' });
        toWrite.push(BlockSchema.parse(incoming));
      }
    }
  }

  return {
    entries,
    skipped,
    toWrite,
    counts: {
      new: entries.filter((e) => e.verdict === 'new').length,
      updated: entries.filter((e) => e.verdict === 'updated').length,
      unchanged: entries.filter((e) => e.verdict === 'unchanged').length,
      skipped: skipped.length,
    },
  };
}

/** Attach the importer's skip reasons to a preview without altering entries. */
export function withSkips(preview: ImportPreview, skipped: readonly IcsSkipped[]): ImportPreview {
  const merged = [...preview.skipped, ...skipped.map((s) => ({ summary: s.summary, reason: s.reason }))];
  return { ...preview, skipped: merged, counts: { ...preview.counts, skipped: merged.length } };
}

/** Subscription URLs: https only, no credentials, and the NORMALISED length
 * must fit the settings schema (percent-encoding can inflate non-ASCII). */
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
  // Validate exactly what will be stored, against the stored-field schema.
  const normalised = parsed.toString();
  const check = IcsSubscriptionUrlSchema.safeParse(normalised);
  if (!check.success) return { ok: false, reason: 'That address is too long once encoded.' };
  return { ok: true, url: normalised };
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
