/**
 * ICS import for Blocks (roadmap Wave 8 part 1).
 *
 * Parsing is delegated to `ical.js` (pinned 2.2.1, MPL-2.0) rather than
 * hand-rolled: it understands VTIMEZONE rules, DST transitions, DURATION,
 * all-day VALUE=DATE, and the RRULE engine (COUNT/UNTIL/INTERVAL/BYDAY/
 * BYMONTHDAY, EXDATE). Rationale and measurements: docs/waves/wave-08.md.
 *
 * Contract:
 * - Never throws. Malformed input returns `blocks: []` plus a `skipped` reason.
 * - Anything not importable is reported in `skipped`; nothing is silently lost.
 * - Recurrence expansion is bounded: occurrences inside
 *   `[now - 7 days, now + windowDays]`, at most `maxOccurrencesPerEvent`, and a
 *   hard iteration cap. A truncated series is reported as a skip.
 *   Non-recurring events are imported regardless of the window.
 * - `calendarRef` is the event UID, so re-export updates rather than duplicates.
 * - Kind/task/project survive via `X-CHRONO-KATA-*`; a block id survives via
 *   `X-CHRONO-KATA-BLOCK-ID`, otherwise a deterministic UUID is derived from the
 *   UID and occurrence time, so importing the same file twice is stable.
 */

import ICAL from 'ical.js';
import { BlockSchema, BlockKindSchema, type Block, type BlockKind } from '@/lib/schemas/block';

export interface IcsImportOptions {
  /** Clock for `createdAt`/`updatedAt` and the recurrence window. */
  now: Date;
  /** Kind for events that carry no `X-CHRONO-KATA-KIND`. */
  defaultKind?: BlockKind;
  /** Days of future occurrences to expand (default 366). */
  windowDays?: number;
  /** Hard per-event occurrence cap (default 500). */
  maxOccurrencesPerEvent?: number;
}

export interface IcsSkipped {
  reason: string;
  uid?: string;
  summary?: string;
}

export interface IcsImportResult {
  blocks: Block[];
  skipped: IcsSkipped[];
  /** Occurrence window used for recurring events (informational). */
  window: { from: Date; to: Date };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_CALENDAR_REF = 200;
const PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECURRENCE_ITERATIONS = 100_000;

/** Deterministic UUID-v4-shaped id from a string (two FNV-1a passes). */
export function stableUuidFromString(value: string): string {
  const fnv = (seed: number) => {
    let hash = seed >>> 0;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  const a = fnv(0x811c9dc5);
  const b = fnv(0x9e3779b9);
  return `${a.slice(0, 8)}-${a.slice(0, 4)}-4${b.slice(0, 3)}-8${b.slice(3, 6)}-${a.slice(0, 8)}${b.slice(0, 4)}`;
}

function uuidOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined;
}

/**
 * Wall-clock components in an IANA zone -> UTC instant, using Intl (two passes
 * so a DST boundary resolves to the right offset). Returns null for an unknown
 * zone name.
 */
export function wallTimeInZoneToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }

  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetAt = (instant: number): number => {
    const formatted = formatter.formatToParts(new Date(instant));
    const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    );
    return asUtc - instant;
  };

  let instant = wallAsUtc - offsetAt(wallAsUtc);
  instant = wallAsUtc - offsetAt(instant);
  return new Date(instant);
}

interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsOf(time: ICAL.Time): TimeParts {
  return {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
}

function localMidnight(parts: TimeParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day);
}

function localWallTime(parts: TimeParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function isFloating(time: ICAL.Time | null | undefined): boolean {
  return !time?.zone || time.zone.tzid === 'floating';
}

/** True when Intl knows the zone name (an IANA zone). */
function isKnownIanaZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve an ICAL time to an instant.
 * - all-day: local midnight;
 * - UTC or a validated VTIMEZONE: exact instant via ical.js;
 * - floating without TZID: the device's local wall clock;
 * - floating with an IANA TZID: Intl (also correct when a VTIMEZONE in the file
 *   disagrees with the real rule, e.g. Outlook's "+02:00 EU summer time");
 * - anything else: null, so the caller skips the event instead of guessing.
 */
function resolveTime(time: ICAL.Time, tzid: string | null): Date | null {
  if (time.isDate) return localMidnight(partsOf(time));
  if (!isFloating(time)) {
    // A VTIMEZONE claims the zone. ical.js throws while expanding unusable
    // rules (and would otherwise resolve them to offset 0), so a zone we
    // cannot evaluate is treated as unsupported rather than guessed.
    try {
      const resolved = time.toJSDate();
      return Number.isFinite(resolved.getTime()) ? resolved : null;
    } catch {
      return null;
    }
  }
  if (!tzid) return localWallTime(partsOf(time));
  if (!isKnownIanaZone(tzid)) return null;
  return wallTimeInZoneToUtc(partsOf(time), tzid);
}

function propTzid(component: ICAL.Component, name: string): string | null {
  const property = component.getFirstProperty(name);
  const tzid = property?.getParameter('tzid');
  return typeof tzid === 'string' && tzid.length > 0 ? tzid : null;
}

/**
 * A VTIMEZONE is only trusted when it defines at least one observance with a
 * parseable DTSTART and a `±HHMM` TZOFFSETTO. A malformed one otherwise
 * registers a zone whose offset resolves to zero, turning a wall time into a
 * silently wrong UTC instant.
 */
function isUsableVtimezone(vtimezone: ICAL.Component): boolean {
  const observances = [
    ...vtimezone.getAllSubcomponents('standard'),
    ...vtimezone.getAllSubcomponents('daylight'),
  ];
  if (observances.length === 0) return false;
  return observances.every((observance) => {
    const dtstart = observance.getFirstPropertyValue('dtstart');
    const offsetTo = observance.getFirstPropertyValue('tzoffsetto');
    return dtstart instanceof ICAL.Time && typeof offsetTo === 'string' && /^[+-]\d{4}$/.test(offsetTo);
  });
}

function registerTimezones(calendar: ICAL.Component): void {
  for (const vtimezone of calendar.getAllSubcomponents('vtimezone')) {
    try {
      const tzid = vtimezone.getFirstPropertyValue('tzid');
      if (typeof tzid !== 'string' || tzid.length === 0) continue;
      if (ICAL.TimezoneService.has(tzid)) continue;
      if (!isUsableVtimezone(vtimezone)) continue;
      ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone));
    } catch {
      // A broken VTIMEZONE is not fatal: the event is skipped when its TZID is
      // neither registered nor a known IANA zone.
    }
  }
}

function titleOf(summary: unknown): string {
  const text = typeof summary === 'string' ? summary.trim() : '';
  return (text === '' ? 'Untitled event' : text).slice(0, MAX_TITLE);
}

function kindOf(component: ICAL.Component, fallback: BlockKind): BlockKind {
  const parsed = BlockKindSchema.safeParse(component.getFirstPropertyValue('x-chrono-kata-kind'));
  return parsed.success ? parsed.data : fallback;
}

function daysBetween(start: Date, end: Date): number {
  const utcDays = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(1, Math.round((utcDays(end) - utcDays(start)) / 86_400_000));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

interface Master {
  start: Date;
  /** Real duration for timed events. */
  durationMs: number;
  /** Nominal day count for all-day events. */
  durationDays: number;
  allDay: boolean;
}

interface EventDescriptor {
  vevent: ICAL.Component;
  uid: string;
  summary?: string;
  startTzid: string | null;
  endTzid: string | null;
  master: Master;
  /** Resolved RECURRENCE-ID start, when this event overrides one instance. */
  recurId: Date | null;
}

/** Start + duration of the event's own occurrence, or an error reason. */
function readMaster(
  event: ICAL.Event,
  vevent: ICAL.Component,
  startTzid: string | null,
  endTzid: string | null,
): { master: Master } | { error: string } {
  const start = resolveTime(event.startDate, startTzid);
  if (!start) return { error: `unsupported timezone "${startTzid ?? 'unknown'}"` };
  const allDay = event.startDate.isDate;

  const dtend = vevent.getFirstProperty('dtend');
  if (dtend) {
    const endTime = dtend.getFirstValue() as ICAL.Time | null;
    if (endTime instanceof ICAL.Time) {
      const end = resolveTime(endTime, endTzid ?? startTzid);
      if (!end) return { error: `unsupported timezone "${endTzid ?? startTzid ?? 'unknown'}"` };
      if (allDay) return { master: { start, durationMs: 0, durationDays: daysBetween(start, end), allDay } };
      if (end.getTime() <= start.getTime()) return { error: 'event has no valid time range' };
      return { master: { start, durationMs: end.getTime() - start.getTime(), durationDays: 0, allDay } };
    }
  }

  const duration = event.duration;
  if (duration) {
    try {
      const seconds = duration.toSeconds();
      if (seconds > 0) {
        if (allDay) {
          return {
            master: { start, durationMs: 0, durationDays: Math.max(1, Math.round(seconds / 86_400)), allDay },
          };
        }
        return { master: { start, durationMs: seconds * 1000, durationDays: 0, allDay } };
      }
    } catch {
      // fall through to the all-day default
    }
  }

  if (allDay) return { master: { start, durationMs: 0, durationDays: 1, allDay } };
  return { error: 'event has no usable end time' };
}

function endOfOccurrence(master: Master, start: Date): Date {
  return master.allDay
    ? addDays(start, master.durationDays)
    : new Date(start.getTime() + master.durationMs);
}

interface Expansion {
  starts: Date[];
  truncatedBy?: 'occurrences' | 'iterations';
  error?: string;
}

function expandOccurrences(
  descriptor: EventDescriptor,
  window: { from: Date; to: Date },
  maxOccurrences: number,
): Expansion {
  const { vevent, startTzid } = descriptor;
  let event: ICAL.Event;
  try {
    event = new ICAL.Event(vevent);
  } catch (error) {
    return { starts: [], error: `unreadable event: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!event.isRecurring()) return { starts: [descriptor.master.start] };

  const starts: Date[] = [];
  try {
    const expansion = new ICAL.RecurExpansion({ component: vevent, dtstart: event.startDate });
    let cursor: ICAL.Time | null;
    let iterations = 0;
    while ((cursor = expansion.next())) {
      const next: ICAL.Time = cursor;
      iterations += 1;
      if (iterations > MAX_RECURRENCE_ITERATIONS) return { starts, truncatedBy: 'iterations' };
      const start = resolveTime(next, startTzid);
      if (!start) return { starts, error: `unsupported timezone "${startTzid ?? 'unknown'}"` };
      if (start.getTime() > window.to.getTime()) break;
      if (start.getTime() < window.from.getTime()) continue;
      starts.push(start);
      if (starts.length > maxOccurrences) {
        starts.pop();
        return { starts, truncatedBy: 'occurrences' };
      }
    }
  } catch (error) {
    return {
      starts,
      error: `unsupported recurrence: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { starts };
}

export function icsToBlocks(rawText: string, options: IcsImportOptions): IcsImportResult {
  const defaultKind = options.defaultKind ?? 'fixed';
  const windowDays = options.windowDays ?? 366;
  const maxOccurrences = options.maxOccurrencesPerEvent ?? 500;
  const now = options.now;
  const window = {
    from: new Date(now.getTime() - PAST_WINDOW_MS),
    to: new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000),
  };

  const blocks: Block[] = [];
  const skipped: IcsSkipped[] = [];
  const skip = (reason: string, uid?: string, summary?: string) =>
    skipped.push({ reason, uid, summary });

  // Windows exports carry a UTF-8 BOM; the parser rejects the whole file with it.
  const text = typeof rawText === 'string' && rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  if (typeof text !== 'string' || text.trim() === '') {
    skip('invalid calendar: empty input');
    return { blocks, skipped, window };
  }

  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(text));
    if (!calendar) throw new Error('no calendar data');
  } catch (error) {
    skip(`invalid calendar: ${error instanceof Error ? error.message : String(error)}`);
    return { blocks, skipped, window };
  }
  registerTimezones(calendar);

  const events = calendar.getAllSubcomponents('vevent');
  if (events.length === 0) {
    skip('no VEVENT components found');
    return { blocks, skipped, window };
  }

  // Pass 1: normalize every VEVENT into a descriptor (or a skip).
  const descriptors: EventDescriptor[] = [];
  for (const vevent of events) {
    const rawUid = vevent.getFirstPropertyValue('uid');
    const uid =
      typeof rawUid === 'string' && rawUid.trim() !== ''
        ? rawUid.trim()
        : `no-uid-${stableUuidFromString(JSON.stringify(vevent.toJSON()))}`;
    const summaryText = vevent.getFirstPropertyValue('summary');
    const summary = typeof summaryText === 'string' ? summaryText : undefined;

    const status = vevent.getFirstPropertyValue('status');
    if (typeof status === 'string' && status.toUpperCase() === 'CANCELLED') {
      skip('cancelled event', uid, summary);
      continue;
    }
    if (!vevent.getFirstProperty('dtstart')) {
      skip('missing DTSTART', uid, summary);
      continue;
    }

    let event: ICAL.Event;
    try {
      event = new ICAL.Event(vevent);
    } catch (error) {
      skip(`unreadable event: ${error instanceof Error ? error.message : String(error)}`, uid, summary);
      continue;
    }

    const startTzid = propTzid(vevent, 'dtstart');
    const endTzid = propTzid(vevent, 'dtend');
    const read = readMaster(event, vevent, startTzid, endTzid);
    if ('error' in read) {
      skip(read.error, uid, summary);
      continue;
    }

    let recurId: Date | null = null;
    const recurIdProperty = vevent.getFirstProperty('recurrence-id');
    if (recurIdProperty) {
      const value = recurIdProperty.getFirstValue() as ICAL.Time | null;
      if (!(value instanceof ICAL.Time)) {
        skip('unreadable RECURRENCE-ID', uid, summary);
        continue;
      }
      const recurIdTzid = recurIdProperty.getParameter('tzid');
      recurId = resolveTime(value, typeof recurIdTzid === 'string' ? recurIdTzid : startTzid);
      if (!recurId) {
        skip(`unsupported timezone "${startTzid ?? 'unknown'}"`, uid, summary);
        continue;
      }
    }

    descriptors.push({
      vevent,
      uid,
      summary,
      startTzid,
      endTzid,
      master: read.master,
      recurId,
    });
  }

  // Pass 2: group overrides with their series and emit blocks.
  const groups = new Map<string, EventDescriptor[]>();
  for (const descriptor of descriptors) {
    const group = groups.get(descriptor.uid) ?? [];
    group.push(descriptor);
    groups.set(descriptor.uid, group);
  }

  const emit = (descriptor: EventDescriptor, start: Date, end: Date, idSeed: string): void => {
    if (end.getTime() <= start.getTime()) {
      skip('occurrence has no valid time range', descriptor.uid, descriptor.summary);
      return;
    }
    const blockId =
      uuidOrUndefined(descriptor.vevent.getFirstPropertyValue('x-chrono-kata-block-id')) ??
      stableUuidFromString(`${descriptor.uid}#${idSeed}`);
    const parsed = BlockSchema.safeParse({
      id: blockId,
      start,
      end,
      kind: kindOf(descriptor.vevent, defaultKind),
      taskId: uuidOrUndefined(descriptor.vevent.getFirstPropertyValue('x-chrono-kata-task-id')) ?? null,
      projectId: uuidOrUndefined(descriptor.vevent.getFirstPropertyValue('x-chrono-kata-project-id')) ?? null,
      title: titleOf(descriptor.summary),
      calendarRef: descriptor.uid.slice(0, MAX_CALENDAR_REF),
      createdAt: now,
      updatedAt: now,
    });
    if (parsed.success) blocks.push(parsed.data);
    else skip('occurrence has no valid time range', descriptor.uid, descriptor.summary);
  };

  for (const [uid, group] of groups) {
    const masters = group.filter((d) => d.recurId === null);
    const overrides = group.filter((d) => d.recurId !== null);

    if (masters.length === 0) {
      // Detached overrides with no series in this file: each is its own block.
      for (const override of overrides) {
        emit(override, override.master.start, endOfOccurrence(override.master, override.master.start), override.master.start.toISOString());
      }
      continue;
    }

    for (const master of masters) {
      const expansion = expandOccurrences(master, window, maxOccurrences);
      if (expansion.error) {
        skip(expansion.error, uid, master.summary);
        continue;
      }
      if (expansion.truncatedBy === 'occurrences') {
        skip(`recurrence truncated at ${maxOccurrences} occurrences`, uid, master.summary);
      } else if (expansion.truncatedBy === 'iterations') {
        skip(`recurrence truncated at the ${MAX_RECURRENCE_ITERATIONS}-iteration cap`, uid, master.summary);
      }

      const slots = expansion.starts.map((start) => ({
        start,
        end: endOfOccurrence(master.master, start),
        idSeed: start.toISOString(),
        overridden: false,
        descriptor: master,
      }));

      // A RECURRENCE-ID replaces the occurrence it names (same slot identity,
      // new time) instead of adding a duplicate block for the day.
      for (const override of overrides) {
        const index = slots.findIndex(
          (slot) => !slot.overridden && Math.abs(slot.start.getTime() - override.recurId!.getTime()) < 1000,
        );
        if (index >= 0) {
          const slot = slots[index]!;
          slot.start = override.master.start;
          slot.end = endOfOccurrence(override.master, override.master.start);
          slot.overridden = true;
          slot.descriptor = override;
          continue;
        }
        // An override whose original occurrence is outside the window still
        // deserves to appear, as its own block.
        emit(override, override.master.start, endOfOccurrence(override.master, override.master.start), override.master.start.toISOString());
      }

      for (const slot of slots) emit(slot.descriptor, slot.start, slot.end, slot.idSeed);
    }
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
  return { blocks, skipped, window };
}
