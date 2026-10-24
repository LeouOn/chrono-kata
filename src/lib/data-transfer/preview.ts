/**
 * What an import will do, in plain words, before it does it.
 *
 * Everything here is a pure function of numbers (the device's counts, the file's counts, the merge
 * plan), so the sentences the person reads are tested directly. The tone is the app's: specific,
 * calm, no urgency and no blame. A restore is described as exactly what it replaces.
 */
import { getDb } from '@/lib/db/db';
import { COLLECTIONS, SINGLETONS, countOf, joinWords, type CollectionKey } from './collections';
import type { MergeReport } from './merge';
import type { ExportEnvelope, LeftOutItem } from './types';

export type DeviceCounts = Record<CollectionKey, number>;

export async function deviceCounts(): Promise<DeviceCounts> {
  const db = getDb();
  const entries = await Promise.all(COLLECTIONS.map(async ({ key }) => [key, await db.table(key).count()] as const));
  return Object.fromEntries(entries) as DeviceCounts;
}

export interface PreviewRow {
  key: CollectionKey;
  singular: string;
  plural: string;
  onDevice: number;
  /** null: the file does not carry this kind at all (a replace leaves the device's alone). */
  inFile: number | null;
}

/** One row per kind that exists on the device or in the file. */
export function previewRows(envelope: ExportEnvelope, device: DeviceCounts): PreviewRow[] {
  return COLLECTIONS.flatMap(({ key, singular, plural }) => {
    const carried = envelope[key] as unknown[] | undefined;
    const inFile = carried === undefined ? null : carried.length;
    const onDevice = device[key];
    return onDevice > 0 || (inFile ?? 0) > 0 ? [{ key, singular, plural, onDevice, inFile }] : [];
  });
}

function summarise(rows: PreviewRow[], pick: (row: PreviewRow) => number): string {
  return joinWords(rows.filter((r) => pick(r) > 0).map((r) => countOf(pick(r), r)));
}

/** The sentence the person confirms a replace against. */
export function replaceSentence(rows: PreviewRow[]): string {
  const replaced = rows.filter((r) => r.inFile !== null);
  const here = summarise(replaced, (r) => r.onDevice);
  const there = summarise(replaced, (r) => r.inFile ?? 0);
  const kept = rows.filter((r) => r.inFile === null && r.onDevice > 0);

  let sentence: string;
  if (!here && !there) sentence = 'There is nothing on this device and nothing in the file to replace.';
  else if (!here) sentence = `This device has none of these yet. Restoring adds ${there} from the file.`;
  else if (!there) sentence = `This will remove ${here} from this device. The file has none of these.`;
  else sentence = `This will replace ${here} on this device with ${there} from the file.`;

  if (kept.length > 0) {
    sentence += ` The file has no ${joinWords(kept.map((r) => r.plural))}, so the ${joinWords(kept.map((r) => countOf(r.onDevice, r)))} on this device stay.`;
  }
  return sentence;
}

/** Which single-row records a replace swaps for the file's. */
export function singletonsReplaced(envelope: ExportEnvelope): string[] {
  return SINGLETONS.filter(({ key }) => envelope[key] != null).map(({ label }) => label);
}

export function replaceSecretsLine(): string {
  return 'Your API keys, Google Calendar sign-in and private calendar link stay on this device.';
}

/** What a merge adds, and what it leaves alone. */
export function mergeSentence(report: MergeReport): string {
  const nouns = new Map(COLLECTIONS.map((c) => [c.key, c]));
  const added = joinWords(report.collections.filter((c) => c.added > 0).map((c) => countOf(c.added, nouns.get(c.key)!)));
  const same = report.collections.reduce((n, c) => n + c.same, 0);
  const differs = report.collections.reduce((n, c) => n + c.differs, 0);
  const here = same + differs;

  let sentence = added ? `This will add ${added} to this device.` : 'There is nothing new in the file to add.';
  if (here > 0) {
    sentence += ` ${here.toLocaleString('en-US')} ${here === 1 ? 'is' : 'are'} already here and stay${here === 1 ? 's' : ''} as ${here === 1 ? 'it is' : 'they are'}`;
    sentence += differs > 0 ? `; ${differs.toLocaleString('en-US')} of those differ${differs === 1 ? 's' : ''} from the file's copy, and yours ${differs === 1 ? 'is' : 'are'} kept.` : '.';
  }
  sentence += ' Your settings, streak and AI settings are not changed.';
  return sentence;
}

/** What the file leaves out, as one calm line (empty when it leaves nothing out). */
export function leftOutLine(items: readonly LeftOutItem[] | undefined): string {
  if (!items || items.length === 0) return '';
  const parts = items.map((item) => (item.count > 1 ? `${item.what} (${item.count})` : item.what));
  return `This backup does not include ${joinWords(parts)}. They stay on the device they came from.`;
}

/** After the fact: what a merge did. */
export function mergeResultSentence(report: MergeReport): string {
  const nouns = new Map(COLLECTIONS.map((c) => [c.key, c]));
  const added = joinWords(report.collections.filter((c) => c.added > 0).map((c) => countOf(c.added, nouns.get(c.key)!)));
  const here = report.collections.reduce((n, c) => n + c.same + c.differs, 0);
  const differs = report.collections.reduce((n, c) => n + c.differs, 0);
  let sentence = added ? `Added ${added}.` : 'Nothing new to add.';
  if (here > 0) {
    sentence += ` ${here.toLocaleString('en-US')} already here, left as they were`;
    sentence += differs > 0 ? ` (${differs.toLocaleString('en-US')} differed from the file; yours were kept).` : '.';
  }
  return sentence;
}
