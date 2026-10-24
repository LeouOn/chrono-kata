import type { DayPlan } from '@/lib/schemas/day-plan';

/**
 * Searching journal entries (roadmap Wave 12: "entries are SEARCHABLE").
 *
 * Pure and in memory: a few thousand day plans are small enough that a scan is
 * faster than any index, and it keeps the data model at optional, non-indexed
 * fields (no Dexie version). Matching is case-insensitive on a normalised
 * query (trimmed, whitespace collapsed); the preview shows the text around the
 * first match, on one line, so the search UI has nothing to compute.
 */

export const SEARCH_PREVIEW_MAX = 120;

export type JournalSearchField = 'journal' | 'shutdown' | 'firstAction';

export interface JournalSearchHit {
  date: string;
  /** Which of the day's texts matched, in a stable order. */
  fields: JournalSearchField[];
  /** One line of the matching text around the query. */
  preview: string;
}

type SearchableEntry = Pick<DayPlan, 'date' | 'journal' | 'shutdownNote' | 'firstActionTomorrow'>;

/** Trim, collapse whitespace, lowercase. An empty result means "no query". */
export function normaliseSearchQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The haystack, normalised exactly like the query: whitespace collapsed and
 * lowercased. Journal entries are multi-line, so matching the raw text would
 * miss "position sizing" in "position\nsizing" — the ordinary case for a
 * multi-word search.
 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function fieldText(entry: SearchableEntry): { field: JournalSearchField; text: string }[] {
  return [
    { field: 'journal', text: entry.journal ?? '' },
    { field: 'shutdown', text: entry.shutdownNote ?? '' },
    { field: 'firstAction', text: entry.firstActionTomorrow ?? '' },
  ];
}

function previewAround(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query);
  if (at < 0) return flat.slice(0, SEARCH_PREVIEW_MAX);
  const start = Math.max(0, at - Math.floor((SEARCH_PREVIEW_MAX - query.length) / 3));
  const slice = flat.slice(start, start + SEARCH_PREVIEW_MAX);
  return `${start > 0 ? '…' : ''}${slice}${start + SEARCH_PREVIEW_MAX < flat.length ? '…' : ''}`;
}

/**
 * Entries whose journal, shutdown note or tomorrow's first move contain the
 * query, newest first. An empty (or whitespace-only) query matches nothing: the
 * UI lists entries by date separately, and "search for nothing" is not a match.
 */
export function searchJournalEntries(
  entries: readonly SearchableEntry[],
  query: string,
): JournalSearchHit[] {
  const needle = normaliseSearchQuery(query);
  if (needle === '') return [];

  const hits: JournalSearchHit[] = [];
  for (const entry of entries) {
    const matched = fieldText(entry).filter(({ text }) => flatten(text).includes(needle));
    if (matched.length === 0) continue;
    hits.push({
      date: entry.date,
      fields: matched.map(({ field }) => field),
      preview: previewAround(matched[0]!.text, needle),
    });
  }
  return hits.sort((a, b) => b.date.localeCompare(a.date));
}
