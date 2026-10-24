/**
 * The words the copies screen uses, as pure functions of dates, so they are tested as text and never
 * depend on the device's locale. Calm: "Last copy 12 days ago", never "overdue".
 */
import { COLLECTIONS, countOf, joinWords } from '@/lib/data-transfer/collections';
import { toLocalDateString } from '@/lib/utils/date';
import type { CopyReason } from './copies-db';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function daysBetweenLocal(from: Date, to: Date): number {
  const [fy, fm, fd] = toLocalDateString(from).split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toLocalDateString(to).split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "Today, 09:41", "Yesterday, 09:41", "12 Oct, 09:41" (local time, 24-hour). */
export function copyLabel(madeAt: Date, now: Date): string {
  const time = `${pad(madeAt.getHours())}:${pad(madeAt.getMinutes())}`;
  const ago = daysBetweenLocal(madeAt, now);
  if (ago === 0) return `Today, ${time}`;
  if (ago === 1) return `Yesterday, ${time}`;
  return `${madeAt.getDate()} ${MONTHS[madeAt.getMonth()]}, ${time}`;
}

/** The line at the top of the card. */
export function lastCopyLine(last: Date | null, now: Date): string {
  if (last === null) return 'No copy yet.';
  const ago = daysBetweenLocal(last, now);
  if (ago <= 0) return 'Last copy: today.';
  if (ago === 1) return 'Last copy: yesterday.';
  return `Last copy: ${ago} days ago.`;
}

export function reasonLabel(reason: CopyReason): string {
  return reason === 'daily' ? 'made automatically' : reason === 'before-import' ? 'made just before an import' : 'made by you';
}

/** "214 tasks, 1,310 sessions and 12 projects" (the first three kinds a copy holds). */
export function copySummary(counts: Record<string, number>): string {
  const parts = COLLECTIONS.filter((c) => (counts[c.key] ?? 0) > 0 && c.key !== 'domains')
    .slice(0, 3)
    .map((c) => countOf(counts[c.key]!, c));
  return parts.length > 0 ? joinWords(parts) : 'nothing yet';
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Said on the screen, in these words, always: what copies protect against, and what they do not. */
export const HONEST_LIMIT =
  'These copies are kept in this browser, next to your data. They protect you from a bad import or a mistake, not from the browser clearing its storage. Save a file as well.';
