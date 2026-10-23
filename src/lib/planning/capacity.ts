/**
 * Capacity: how much of a day is actually available for work
 * (roadmap Wave 6).
 *
 * ```
 * capacity = waking hours − fixed commitments − anchors − buffer
 * ```
 *
 * with the buffer being 25% of the **free** time (lead decision Q7), and
 * "free" meaning what is left of the waking window once fixed commitments and
 * anchors are taken out.
 *
 * Two rules matter and are easy to get wrong:
 *
 * - **Overlaps are unioned, not summed.** A fixed commitment that sits inside
 *   an anchor, or two fixed commitments that overlap, cost the time once.
 * - **The clock is the clock.** A day that is 23 or 25 hours long (daylight
 *   saving) gives its real elapsed minutes, and everything is clipped to the
 *   waking window in absolute time, so a window that is 22:00–07:00 is nine
 *   hours on every day of the year.
 */

import type { Anchor, WakingHours } from '@/lib/schemas/settings';
import { expandAnchors } from './anchors';
import { elapsedMinutes, wakingWindow } from './time';

export interface TimeInterval {
  readonly start: Date;
  readonly end: Date;
}

export interface CapacityInput {
  /** Local day key, YYYY-MM-DD. */
  readonly day: string;
  readonly wakingHours: WakingHours;
  /** Fixed commitments (calendar events) for that day. */
  readonly fixedBlocks: readonly TimeInterval[];
  /** Recurring protected windows. */
  readonly anchors: readonly Anchor[];
  /** Buffer as a percentage of the free time. Defaults to 25. */
  readonly bufferPct?: number;
}

export interface CapacityResult {
  /** Minutes in the waking window (real elapsed time). */
  readonly wakingMin: number;
  /** Minutes of fixed commitments inside the waking window. */
  readonly fixedMin: number;
  /** Minutes of anchors inside the waking window. */
  readonly anchorMin: number;
  /** Minutes of the waking window that are neither fixed nor anchored. */
  readonly freeMin: number;
  /** Buffer held back from the free time. */
  readonly bufferMin: number;
  /** What is left for picks. Never negative. */
  readonly capacityMin: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/** Total minutes of a set of intervals, counting overlaps once. */
export function unionMinutes(spans: readonly Span[]): number {
  const sorted = spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return 0;
  let total = 0;
  let currentStart = sorted[0]!.start;
  let currentEnd = sorted[0]!.end;
  for (const span of sorted.slice(1)) {
    if (span.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, span.end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = span.start;
    currentEnd = span.end;
  }
  total += currentEnd - currentStart;
  return Math.round(total / 60_000);
}

function clip(spans: readonly Span[], from: number, to: number): Span[] {
  return spans
    .map((span) => ({ start: Math.max(span.start, from), end: Math.min(span.end, to) }))
    .filter((span) => span.end > span.start);
}

export function computeCapacity(input: CapacityInput): CapacityResult {
  const bufferPct = input.bufferPct ?? 25;
  const window = wakingWindow(input.day, input.wakingHours);

  const fixedSpans = clip(
    input.fixedBlocks.map((block) => ({
      start: block.start.getTime(),
      end: block.end.getTime(),
    })),
    window.start,
    window.end,
  );
  const anchorSpans = clip(
    expandAnchors(input.anchors, input.day).map((interval) => ({
      start: interval.start.getTime(),
      end: interval.end.getTime(),
    })),
    window.start,
    window.end,
  );

  const wakingMin = elapsedMinutes(window.start, window.end);
  const fixedMin = unionMinutes(fixedSpans);
  const anchorMin = unionMinutes(anchorSpans);
  // Fixed commitments and anchors may overlap; the overlap is counted once.
  const occupiedMin = unionMinutes([...fixedSpans, ...anchorSpans]);

  const freeMin = Math.max(0, wakingMin - occupiedMin);
  const bufferMin = Math.min(freeMin, Math.round((freeMin * bufferPct) / 100));
  const capacityMin = Math.max(0, freeMin - bufferMin);

  return { wakingMin, fixedMin, anchorMin, freeMin, bufferMin, capacityMin };
}
