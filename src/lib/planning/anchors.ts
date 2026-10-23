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
