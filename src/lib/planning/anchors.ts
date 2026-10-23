/**
 * Anchors: recurring protected windows (roadmap Wave 6).
 *
 * An anchor is a window that belongs to the weekdays it starts on. It may
 * cross midnight, in which case the tail belongs to the following day — the
 * part of "22:00 to 02:00" that falls after midnight belongs to the next
 * morning, and that is what `expandAnchors` hands back for that day.
 */

import { addDays } from '@/lib/pacing/days';
import type { Anchor } from '@/lib/schemas/settings';
import {
  epochToLocalClock,
  localDayEnd,
  localDayStart,
  localWeekday,
  localWallClockToEpoch,
  parseClockTime,
} from './time';

export interface AnchorInterval {
  readonly id: string;
  readonly title: string;
  readonly domainId?: string | null;
  readonly start: Date;
  readonly end: Date;
}

/** True when the anchor's end is at or before its start, so it crosses midnight. */
export function anchorCrossesMidnight(anchor: Pick<Anchor, 'start' | 'end'>): boolean {
  const { hh: startH, mm: startM } = parseClockTime(anchor.start);
  const { hh: endH, mm: endM } = parseClockTime(anchor.end);
  return endH * 60 + endM <= startH * 60 + startM;
}

/**
 * The concrete intervals an anchor covers inside one local day.
 *
 * For an anchor that crosses midnight this returns up to two pieces: the tail
 * that started yesterday and ends today, and the piece that starts today.
 * Each piece is clipped to the day.
 */
export function anchorIntervalsOnDay(anchor: Anchor, localDay: string): AnchorInterval[] {
  const dayStart = localDayStart(localDay);
  const dayEnd = localDayEnd(localDay);
  const pieces: AnchorInterval[] = [];

  const make = (startMs: number, endMs: number): AnchorInterval | null => {
    const from = Math.max(startMs, dayStart);
    const to = Math.min(endMs, dayEnd);
    if (to <= from) return null;
    return {
      id: anchor.id,
      title: anchor.title,
      domainId: anchor.domainId,
      start: new Date(from),
      end: new Date(to),
    };
  };

  const crosses = anchorCrossesMidnight(anchor);

  // The tail of yesterday's anchor, when the anchor crosses midnight and
  // yesterday was one of its weekdays.
  if (crosses) {
    const yesterday = addDays(localDay, -1);
    if (anchor.weekdays.includes(localWeekday(yesterday))) {
      const tail = make(
        localWallClockToEpoch(yesterday, anchor.start),
        localWallClockToEpoch(localDay, anchor.end),
      );
      if (tail) pieces.push(tail);
    }
  }

  // The anchor's own piece, starting today.
  if (anchor.weekdays.includes(localWeekday(localDay))) {
    const start = localWallClockToEpoch(localDay, anchor.start);
    const end = crosses
      ? localWallClockToEpoch(addDays(localDay, 1), anchor.end)
      : localWallClockToEpoch(localDay, anchor.end);
    const piece = make(start, end);
    if (piece) pieces.push(piece);
  }

  return pieces;
}

/**
 * Every anchor interval that touches a local day, sorted by start time.
 *
 * The intervals of one anchor may overlap each other (an anchor that crosses
 * midnight and starts again the next evening are different days, so this only
 * happens for anchors listed twice); overlapping pieces are left as they are
 * here and unioned by the capacity maths.
 */
export function expandAnchors(anchors: readonly Anchor[], localDay: string): AnchorInterval[] {
  const intervals: AnchorInterval[] = [];
  for (const anchor of anchors) {
    intervals.push(...anchorIntervalsOnDay(anchor, localDay));
  }
  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  return intervals;
}

/** The local day key and clock of an interval's start, for messages. */
export function describeInterval(interval: AnchorInterval): string {
  const start = epochToLocalClock(interval.start.getTime());
  const end = epochToLocalClock(interval.end.getTime());
  return `${start.clock}–${end.clock}`;
}

/**
 * Anchor intervals that touch a waking window, clipped to it.
 *
 * Both `computeCapacity` and `rankPicks` must see the same thing: anchors for
 * the window's day AND the next day (an overnight window reads past midnight),
 * clipped to [window.start, window.end]. Keeping this in one helper stops the
 * two from disagreeing — the seam where an out-of-window anchor used to add
 * availability to the ranking.
 */
export function anchorsWithinWindow(
  anchors: readonly Anchor[],
  localDay: string,
  window: { readonly start: number; readonly end: number },
): AnchorInterval[] {
  const pieces = [
    ...expandAnchors(anchors, localDay),
    ...expandAnchors(anchors, addDays(localDay, 1)),
  ];
  const clipped: AnchorInterval[] = [];
  for (const piece of pieces) {
    const from = Math.max(piece.start.getTime(), window.start);
    const to = Math.min(piece.end.getTime(), window.end);
    if (to <= from) continue;
    clipped.push({ ...piece, start: new Date(from), end: new Date(to) });
  }
  return clipped;
}
