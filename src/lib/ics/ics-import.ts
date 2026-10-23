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

/** Resolve an ICAL time to an instant, honouring UTC / VTIMEZONE / TZID. */
function resolveTime(time: ICAL.Time, tzid: string | null): Date | null {
  if (time.isDate) return localMidnight(partsOf(time));
  if (!isFloating(time)) return time.toJSDate();
  if (!tzid) return localWallTime(partsOf(time));
  return wallTimeInZoneToUtc(partsOf(time), tzid);
}

function propTzid(component: ICAL.Component, name: string): string | null {
  const property = component.getFirstProperty(name);
  const tzid = property?.getParameter('tzid');
  return typeof tzid === 'string' && tzid.length > 0 ? tzid : null;
}

function registerTimezones(calendar: ICAL.Component): void {
  for (const vtimezone of calendar.getAllSubcomponents('vtimezone')) {
    try {
      const tzid = vtimezone.getFirstPropertyValue('tzid');
      if (typeof tzid !== 'string' || ICAL.TimezoneService.has(tzid)) continue;
      ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone));
    } catch {
      // A broken VTIMEZONE is not fatal: the IANA TZID fallback may still work.
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

/** Start + duration of the event's first occurrence, or an error reason. */
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

export function icsToBlocks(text: string, options: IcsImportOptions): IcsImportResult {
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

    const dtstart = vevent.getFirstProperty('dtstart');
    if (!dtstart) {
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
    const master = read.master;

    const occurrences: Date[] = [];
    if (event.isRecurring()) {
      let cursor: ICAL.Time | null;
      try {
        const expansion = new ICAL.RecurExpansion({ component: vevent, dtstart: event.startDate });
        let iterations = 0;
        let truncated = false;
        // ical.js returns undefined (not null) once the series is exhausted.
        while ((cursor = expansion.next())) {
          const next: ICAL.Time = cursor;
          iterations += 1;
          if (iterations > MAX_RECURRENCE_ITERATIONS) {
            truncated = true;
            break;
          }
          const start = resolveTime(next, startTzid);
          if (!start) {
            skip(`unsupported timezone "${startTzid ?? 'unknown'}"`, uid, summary);
            break;
          }
          if (start.getTime() > window.to.getTime()) break;
          if (start.getTime() < window.from.getTime()) continue;
          occurrences.push(start);
          if (occurrences.length > maxOccurrences) {
            occurrences.pop();
            truncated = true;
            break;
          }
        }
        if (truncated) {
          skip(`recurrence truncated at ${maxOccurrences} occurrences`, uid, summary);
        }
      } catch (error) {
        skip(
          `unsupported recurrence: ${error instanceof Error ? error.message : String(error)}`,
          uid,
          summary,
        );
        continue;
      }
    } else {
      occurrences.push(master.start);
    }

    let invalidOccurrence = false;
    for (const start of occurrences) {
      const end = endOfOccurrence(master, start);
      if (end.getTime() <= start.getTime()) {
        invalidOccurrence = true;
        continue;
      }
      const blockId =
        uuidOrUndefined(vevent.getFirstPropertyValue('x-chrono-kata-block-id')) ??
        stableUuidFromString(`${uid}#${start.toISOString()}`);

      const parsed = BlockSchema.safeParse({
        id: blockId,
        start,
        end,
        kind: kindOf(vevent, defaultKind),
        taskId: uuidOrUndefined(vevent.getFirstPropertyValue('x-chrono-kata-task-id')) ?? null,
        projectId: uuidOrUndefined(vevent.getFirstPropertyValue('x-chrono-kata-project-id')) ?? null,
        title: titleOf(summary),
        calendarRef: uid.slice(0, MAX_CALENDAR_REF),
        createdAt: now,
        updatedAt: now,
      });
      if (parsed.success) blocks.push(parsed.data);
      else invalidOccurrence = true;
    }
    if (invalidOccurrence) skip('occurrence has no valid time range', uid, summary);
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
  return { blocks, skipped, window };
}
