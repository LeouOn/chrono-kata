/**
 * Rule-based capture parsing (roadmap Wave 2, part 1).
 *
 * `parseCapture('fix hose #life ~20m !high tomorrow @hardware-store')`
 *   -> title 'fix hose', domain Life admin, estimateMin 20, energy 'high',
 *      deferUntil <tomorrow as a local day key>, contexts ['hardware-store']
 *
 * Design rules:
 * - Pure: no DB, no network, no LLM, no `new Date()` — the caller injects `now`
 *   and the domains, so results are deterministic and timezone-testable.
 * - Local day keys only (`toLocalDateString`), never UTC slicing.
 * - Everything the parser does not recognise stays in the title, and the title
 *   is never empty (it falls back to the raw line).
 */

import { toLocalDateString } from '@/lib/utils/date';

export type CaptureEnergy = 'low' | 'med' | 'high';

/** The only domain fields the parser needs. `aliases` are matched like the name. */
export interface CaptureDomain {
  id: string;
  name: string;
  aliases?: readonly string[];
}

export interface ParseCaptureOptions {
  /** Clock for the capture; only its local calendar day matters. */
  now: Date;
  /** Domains to resolve `#tags` against. Omitted or empty: every tag is unknown. */
  domains?: readonly CaptureDomain[];
}

export interface ParsedCapture {
  /** The original line, untouched. */
  raw: string;
  /** What is left after recognized tokens are removed; never empty. */
  title: string;
  domainId: string | null;
  /** The tag that resolved the domain, e.g. '#life'. */
  domainTag: string | null;
  estimateMin: number | null;
  energy: CaptureEnergy | null;
  /** Local day key of `now` (YYYY-MM-DD), so callers need not recompute it. */
  today: string;
  /** Local day key the item is deferred to, from a date phrase. */
  deferUntil: string | null;
  contexts: string[];
  /**
   * `#tags` that matched no domain (unknown or ambiguous prefix). They are
   * reported here **and** left in the title, so nothing typed is lost.
   */
  unknownDomainTags: string[];
}

const MAX_TITLE_LENGTH = 200; // TaskSchema.title max
/** TaskSchema.context item max. Longer @tags are left in the title. */
const MAX_CONTEXT_LENGTH = 50;
/** TaskSchema.context max length. A 11th distinct @tag is left in the title. */
const MAX_CONTEXTS = 10;
/** Relative date cap: 100 years in days. Larger offsets stay in the title. */
const MAX_RELATIVE_DAYS = 36_500;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_PATTERNS: Record<string, Weekday> = {
  sun: 'sun',
  sunday: 'sun',
  mon: 'mon',
  monday: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  wed: 'wed',
  weds: 'wed',
  wednesday: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  fri: 'fri',
  friday: 'fri',
  sat: 'sat',
  saturday: 'sat',
};

const ENERGY_WORDS: Record<string, CaptureEnergy> = {
  low: 'low',
  l: 'low',
  med: 'med',
  m: 'med',
  medium: 'med',
  high: 'high',
  h: 'high',
};

interface Accumulator {
  domainId: string | null;
  domainTag: string | null;
  estimateMin: number | null;
  energy: CaptureEnergy | null;
  deferUntil: string | null;
  contexts: string[];
  unknownDomainTags: string[];
  /** [start, end) ranges of the raw line that are consumed by tokens. */
  consumed: Array<[number, number]>;
}

/** Lowercase and drop everything but letters/digits, so '#career-build' == 'Career/Build'. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Local calendar day `offset` days from `from`, at midday to stay clear of DST edges. */
function localDayOffset(from: Date, offset: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12);
}

function dayKeyFrom(from: Date, offset: number): string {
  return toLocalDateString(localDayOffset(from, offset));
}

function weekdayIndex(name: Weekday): number {
  return WEEKDAYS.indexOf(name);
}

/**
 * Nearest day with the given weekday, today included; `next` skips today.
 * On a Friday, bare 'mon' and 'next mon' both mean the following Monday;
 * on a Monday, bare 'mon' means today and 'next mon' means a week later.
 */
function dayKeyForWeekday(now: Date, target: Weekday, skipToday: boolean): string {
  const current = now.getDay();
  const wanted = weekdayIndex(target);
  let delta = (wanted - current + 7) % 7;
  if (skipToday && delta === 0) delta = 7;
  return dayKeyFrom(now, delta);
}

/** True when only whitespace or punctuation remains after `end`. */
function isTerminalToken(raw: string, end: number): boolean {
  return /^[\s.,;:!?)\]-]*$/.test(raw.slice(end));
}

/** Resolve a `#tag` to a domain: exact name/alias first, then unambiguous prefix. */
function resolveDomain(
  tag: string,
  domains: readonly CaptureDomain[],
): { domain: CaptureDomain } | { ambiguous: CaptureDomain[] } | null {
  const key = normalizeKey(tag);
  if (!key) return null;

  const exact = domains.filter((domain) =>
    [domain.name, ...(domain.aliases ?? [])].some((name) => normalizeKey(name) === key),
  );
  if (exact.length === 1) return { domain: exact[0]! };
  if (exact.length > 1) return { ambiguous: exact };

  const prefixed = domains.filter((domain) =>
    [domain.name, ...(domain.aliases ?? [])].some((name) => normalizeKey(name).startsWith(key)),
  );
  if (prefixed.length === 1) return { domain: prefixed[0]! };
  if (prefixed.length > 1) return { ambiguous: prefixed };
  return null;
}

function overlaps(consumed: Array<[number, number]>, start: number, end: number): boolean {
  return consumed.some(([from, to]) => start < to && end > from);
}

// Each matcher keeps the leading boundary group `(^|\s)` so a token only starts
// a word; the boundary itself is not consumed.
const ISO_DATE = /(^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$|[,.;:!?)])/g;
const IN_RELATIVE = /(^|\s)in\s+(\d+)\s+(day|days|week|weeks)(?=\s|$|[,.;:!?)])/gi;
const NEXT_WEEKDAY = new RegExp(`(^|\\s)next\\s+(${Object.keys(WEEKDAY_PATTERNS).join('|')})(?=\\s|$|[,.;:!?)])`, 'gi');
const TODAY_TOMORROW = /(^|\s)(today|tomorrow)(?=\s|$|[,.;:!?)])/gi;
const BARE_WEEKDAY = new RegExp(`(^|\\s)(${Object.keys(WEEKDAY_PATTERNS).join('|')})(?=\\s|$|[,.;:!?)])`, 'gi');
const ESTIMATE = /(^|\s)~(?:(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)?)?|(\d+)\s*(?:m|min|mins|minute|minutes))(?=\s|$|[,.;:!?)])/gi;
const ENERGY = /(^|\s)!(low|medium|med|high|l|m|h)(?=\s|$|[,.;:!?)])/gi;
const DOMAIN_TAG = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu;
const CONTEXT_TAG = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}_./-]*)/gu;

function scan(
  raw: string,
  pattern: RegExp,
  acc: Accumulator,
  handle: (match: RegExpExecArray, tokenStart: number, tokenEnd: number) => boolean,
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[1]!.length;
    const end = match.index + match[0].length;
    if (overlaps(acc.consumed, start, end)) continue;
    if (handle(match, start, end)) acc.consumed.push([start, end]);
  }
}

function takeDates(raw: string, now: Date, acc: Accumulator): void {
  // Date phrases come from five rules, so "last wins" must follow document
  // position, not rule order: collect (position, day) and take the latest.
  const found: Array<{ at: number; key: string }> = [];

  scan(raw, ISO_DATE, acc, (m, start) => {
    const year = Number(m[2]);
    const month = Number(m[3]);
    const day = Number(m[4]);
    const probe = new Date(year, month - 1, day, 12);
    const valid =
      probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
    if (!valid) return false;
    found.push({ at: start, key: toLocalDateString(probe) });
    return true;
  });

  scan(raw, IN_RELATIVE, acc, (m, start) => {
    const count = Number(m[2]);
    const unit = m[3]!.toLowerCase();
    if (!Number.isFinite(count) || count < 0) return false;
    const days = unit.startsWith('week') ? count * 7 : count;
    // Keep the "out-of-range stays in the title" policy: an offset that cannot
    // produce a valid Date is not a date token.
    if (!Number.isFinite(days) || days > MAX_RELATIVE_DAYS) return false;
    found.push({ at: start, key: dayKeyFrom(now, days) });
    return true;
  });

  scan(raw, NEXT_WEEKDAY, acc, (m, start) => {
    const target = WEEKDAY_PATTERNS[m[2]!.toLowerCase()];
    if (!target) return false;
    found.push({ at: start, key: dayKeyForWeekday(now, target, true) });
    return true;
  });

  scan(raw, TODAY_TOMORROW, acc, (m, start) => {
    found.push({ at: start, key: dayKeyFrom(now, m[2]!.toLowerCase() === 'tomorrow' ? 1 : 0) });
    return true;
  });

  // Bare weekday names are also ordinary nouns ("Friday night plan",
  // "Monday standup"), so they only become dates when nothing follows them.
  // 'next friday', 'tomorrow' and explicit phrases are unambiguous anywhere.
  scan(raw, BARE_WEEKDAY, acc, (m, start, end) => {
    const target = WEEKDAY_PATTERNS[m[2]!.toLowerCase()];
    if (!target) return false;
    if (!isTerminalToken(raw, end)) return false;
    found.push({ at: start, key: dayKeyForWeekday(now, target, false) });
    return true;
  });

  if (found.length > 0) {
    found.sort((a, b) => a.at - b.at);
    acc.deferUntil = found[found.length - 1]!.key;
  }
}

function takeEstimate(raw: string, acc: Accumulator): void {
  scan(raw, ESTIMATE, acc, (m) => {
    const hours = m[2] != null ? Number(m[2]) : 0;
    const extraMinutes = m[3] != null ? Number(m[3]) : 0;
    const minutesOnly = m[4] != null ? Number(m[4]) : null;
    const total = minutesOnly ?? hours * 60 + extraMinutes;
    if (!Number.isFinite(total) || total <= 0 || total > 10080) return false;
    acc.estimateMin = total;
    return true;
  });
}

function takeEnergy(raw: string, acc: Accumulator): void {
  scan(raw, ENERGY, acc, (m) => {
    const energy = ENERGY_WORDS[m[2]!.toLowerCase()];
    if (!energy) return false;
    acc.energy = energy;
    return true;
  });
}

function takeContexts(raw: string, acc: Accumulator): void {
  scan(raw, CONTEXT_TAG, acc, (m) => {
    const value = m[2]!.replace(/[.,;:!?]+$/, '');
    if (!value) return false;
    // Values the task schema cannot hold stay in the title rather than being
    // dropped or failing later.
    if (value.length > MAX_CONTEXT_LENGTH) return false;
    const key = value.toLowerCase();
    if (acc.contexts.some((existing) => existing.toLowerCase() === key)) {
      return true; // a repeat consumes no slot
    }
    if (acc.contexts.length >= MAX_CONTEXTS) return false;
    acc.contexts.push(value);
    return true;
  });
}

function takeDomain(raw: string, domains: readonly CaptureDomain[], acc: Accumulator): void {
  scan(raw, DOMAIN_TAG, acc, (m) => {
    const tag = m[2]!;
    const resolved = resolveDomain(tag, domains);
    if (resolved && 'domain' in resolved) {
      // Last resolved tag wins (roadmap is silent; documented in docs/waves).
      acc.domainId = resolved.domain.id;
      acc.domainTag = `#${tag}`;
      return true;
    }
    if (resolved && 'ambiguous' in resolved) {
      acc.unknownDomainTags.push(`#${tag}`);
      return false;
    }
    acc.unknownDomainTags.push(`#${tag}`);
    return false;
  });
}

const TRAILING_PUNCTUATION = '.,;:!?)';

/**
 * A token that ends a sentence leaves its punctuation behind ('fri.',
 * '@phone.'). Swallow that one character so the title does not collect a
 * dangling full stop; punctuation inside the line or before a word is kept.
 */
function extendOverTerminalPunctuation(raw: string, end: number): number {
  const next = raw[end];
  if (next === undefined || !TRAILING_PUNCTUATION.includes(next)) return end;
  const after = raw[end + 1];
  if (after !== undefined && !/[\s]/.test(after)) return end;
  return end + 1;
}

function buildTitle(raw: string, consumed: Array<[number, number]>): string {
  if (consumed.length === 0) return capTitle(raw.trim());
  const sorted = [...consumed]
    .map(([start, end]) => [start, extendOverTerminalPunctuation(raw, end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    result += raw.slice(cursor, start) + ' ';
    cursor = Math.max(cursor, end);
  }
  result += raw.slice(cursor);
  const collapsed = result.replace(/\s+/g, ' ').trim();
  return capTitle(collapsed || raw.trim());
}

function capTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

/**
 * Parse one captured line. Unrecognised text (including unknown `#tags`) stays
 * in `title`; recognised tokens are removed. Repeated single-value tokens such
 * as `#tag`, `~estimate`, `!energy` and date phrases resolve **last-wins**;
 * `@contexts` accumulate in order, de-duplicated case-insensitively.
 */
export function parseCapture(line: string, options: ParseCaptureOptions): ParsedCapture {
  const raw = line ?? '';
  const { now } = options;
  const domains = options.domains ?? [];

  const acc: Accumulator = {
    domainId: null,
    domainTag: null,
    estimateMin: null,
    energy: null,
    deferUntil: null,
    contexts: [],
    unknownDomainTags: [],
    consumed: [],
  };

  takeDates(raw, now, acc);
  takeEstimate(raw, acc);
  takeEnergy(raw, acc);
  takeDomain(raw, domains, acc);
  takeContexts(raw, acc);

  return {
    raw,
    title: buildTitle(raw, acc.consumed),
    domainId: acc.domainId,
    domainTag: acc.domainTag,
    estimateMin: acc.estimateMin,
    energy: acc.energy,
    today: toLocalDateString(now),
    deferUntil: acc.deferUntil,
    contexts: acc.contexts,
    unknownDomainTags: acc.unknownDomainTags,
  };
}
