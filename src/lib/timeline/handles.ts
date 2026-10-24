import type { Interval } from '@/lib/planning/layout';

export const PX_PER_MIN = 1.1;
export const BLOCK_MIN_PX = 24;

export interface HandleGeometry {
  /** Offsets relative to the rendered block's top edge, in pixels. */
  start: { top: number; height: number; bar: number };
  end: { top: number; height: number; bar: number };
  /** Rendered height including the 44px touch minimum. */
  blockHeight: number;
}

const MAX_OUTWARD = 22;
const MAX_INWARD = 11;

export function renderedHeightPx(durationMs: number): number {
  return Math.max(BLOCK_MIN_PX, Math.round((durationMs / 60_000) * PX_PER_MIN));
}

/**
 * Handle hit boxes in rendered pixels. The visible bar sits on the block edge;
 * the hit box grows inward at most a third of the rendered block (11px, so a
 * 30-minute block keeps an 11px movable middle) and outward at most half the gap
 * to the neighbouring block in the same lane. Adjacent blocks never steal each
 * other's edge; the handle itself reaches the 44px touch target by extending
 * outward while the block body keeps a movable middle.
 */
export function handleGeometry(
  block: Interval,
  neighbours: { previousEnd?: number; nextStart?: number; fullWidth?: boolean },
): HandleGeometry {
  const blockHeight = renderedHeightPx(block.end - block.start);
  const inward = Math.min(MAX_INWARD, Math.floor(blockHeight / 3));
  const gapBefore = neighbours.previousEnd == null ? Number.POSITIVE_INFINITY : block.start - neighbours.previousEnd;
  const gapAfter = neighbours.nextStart == null ? Number.POSITIVE_INFINITY : neighbours.nextStart - block.end;
  // With a neighbour, grow only inward: outward growth can still collide with
  // the neighbour's handle through stacking order even when the boxes do not
  // overlap. An isolated edge may reach the full touch target outward.
  // Outward growth only when this block owns the full width. In a shared lane
  // the next cluster can be full-width and would otherwise overlap this lane.
  const outwardBefore = gapBefore === Number.POSITIVE_INFINITY && neighbours.fullWidth ? MAX_OUTWARD : 0;
  const outwardAfter = gapAfter === Number.POSITIVE_INFINITY && neighbours.fullWidth ? MAX_OUTWARD : 0;
  return {
    start: { top: -outwardBefore, height: outwardBefore + inward, bar: 0 },
    end: { top: blockHeight - inward, height: inward + outwardAfter, bar: inward },
    blockHeight,
  };
}

export function laneNeighbours<T extends Interval & { lane?: number }>(
  block: T,
  all: readonly T[],
): { previousEnd?: number; nextStart?: number } {
  const lane = block.lane ?? 0;
  let previousEnd: number | undefined;
  let nextStart: number | undefined;
  for (const other of all) {
    if (other === block || (other.lane ?? 0) !== lane) continue;
    if (other.end <= block.start) previousEnd = Math.max(previousEnd ?? other.end, other.end);
    if (other.start >= block.end) nextStart = Math.min(nextStart ?? other.start, other.start);
  }
  return { previousEnd, nextStart };
}
