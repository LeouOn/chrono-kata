/**
 * Pure time-blocking layout core (roadmap Wave 7, PR 1).
 *
 * Everything here works in epoch milliseconds and is deterministic: the same
 * input (in any order) gives the same output, and all decisions are documented
 * constants rather than hidden heuristics.
 *
 * Rules:
 * - Blocks stay inside the waking window and never start before `now`.
 * - A block never overlaps a fixed commitment, and never overlaps an anchor
 *   unless the pick belongs to that anchor's domain (the same rule ranking
 *   uses).
 * - At least `MIN_GAP_MIN` of breathing room between proposed blocks.
 * - Size = the pick's estimate (default 25) rounded UP to the snap step.
 * - Energy preference v1 is the documented constant below: a high-energy pick
 *   goes before noon when there is room, a low-energy pick after noon when
 *   there is room. It is not a setting yet.
 */

import { DEFAULT_PICK_MINUTES } from './overcommit';

export const MIN_GAP_MIN = 5;
export const DEFAULT_STEP_MIN = 15;
/** Energy preference v1: high work before noon, low work after it, when there is room. */
export const ENERGY_SPLIT_HOUR = 12;

export interface Interval {
  readonly start: number;
  readonly end: number;
}

export interface LayoutWindow {
  readonly start: number;
  readonly end: number;
}

export interface AnchorInterval extends Interval {
  readonly domainId?: string | null;
}

export interface PickForLayout {
  readonly id: string;
  readonly estimateMin?: number | null;
  readonly energy?: 'low' | 'med' | 'high' | null;
  readonly domainId?: string | null;
  readonly createdAt: Date;
}

export interface ProposedBlock extends Interval {
  readonly taskId: string;
}

export interface LayoutResult {
  readonly blocks: ProposedBlock[];
  readonly unplaced: PickForLayout[];
}

export interface ProposeLayoutInput {
  readonly picks: readonly PickForLayout[];
  readonly window: LayoutWindow;
  readonly fixedBlocks: readonly Interval[];
  readonly anchors: readonly AnchorInterval[];
  readonly now: number;
  readonly stepMin?: number;
}

export interface ReplanInput extends ProposeLayoutInput {
  /** Existing focus blocks; the ones already started are kept where they are. */
  readonly existingFocusBlocks: readonly (Interval & { readonly taskId?: string | null })[];
}

export interface ReplanResult {
  readonly relaid: ProposedBlock[];
  readonly kept: (Interval & { readonly taskId?: string | null })[];
  readonly overflow: PickForLayout[];
}

const MINUTE_MS = 60_000;

/** Round an instant to a step boundary. `up` is used for starts, `down` for ends. */
export function snapToStep(instant: number, stepMin: number, mode: 'nearest' | 'up' | 'down' = 'nearest'): number {
  const step = Math.max(1, stepMin) * MINUTE_MS;
  if (mode === 'up') return Math.ceil(instant / step) * step;
  if (mode === 'down') return Math.floor(instant / step) * step;
  return Math.round(instant / step) * step;
}

function snapDown(instant: number, stepMin: number): number {
  return snapToStep(instant, stepMin, 'down');
}

function snapUp(instant: number, stepMin: number): number {
  return snapToStep(instant, stepMin, 'up');
}

/**
 * Move a block by `deltaMs`, snapped, clamped to the window, keeping its length.
 * A window too short for the block clamps the block's end to the window.
 */
export function moveBlock(
  block: Interval,
  deltaMs: number,
  window: LayoutWindow,
  stepMin: number = DEFAULT_STEP_MIN,
): Interval {
  const duration = Math.max(stepMin * MINUTE_MS, block.end - block.start);
  let start = snapDown(block.start + deltaMs, stepMin);
  start = Math.max(window.start, Math.min(start, window.end - duration));
  start = snapDown(start, stepMin);
  if (start < window.start) start = window.start;
  const end = Math.min(start + duration, window.end);
  return { start, end };
}

/**
 * Resize a block from its start or end, snapped, never shorter than one step,
 * never outside the window.
 */
export function resizeBlock(
  block: Interval,
  edge: 'start' | 'end',
  target: number,
  window: LayoutWindow,
  stepMin: number = DEFAULT_STEP_MIN,
): Interval {
  const step = Math.max(1, stepMin) * MINUTE_MS;
  if (edge === 'start') {
    let start = snapToStep(target, stepMin, 'nearest');
    start = Math.max(window.start, Math.min(start, block.end - step));
    return { start, end: block.end };
  }
  let end = snapToStep(target, stepMin, 'nearest');
  end = Math.min(window.end, Math.max(end, block.start + step));
  return { start: block.start, end };
}

/** Merge overlapping/adjacent intervals after sorting. */
export function unionIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, interval.end) };
      continue;
    }
    merged.push(interval);
  }
  return merged;
}

function subtract(window: Interval, blocked: readonly Interval[]): Interval[] {
  const occupied = unionIntervals(blocked);
  const result: Interval[] = [];
  let cursor = window.start;
  for (const interval of occupied) {
    if (interval.end <= cursor) continue;
    if (interval.start >= window.end) break;
    if (interval.start > cursor) {
      result.push({ start: cursor, end: Math.min(interval.start, window.end) });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < window.end) result.push({ start: cursor, end: window.end });
  return result.filter((interval) => interval.end > interval.start);
}

/** Free intervals inside the window for a pick of a given domain. */
function freeForDomain(
  window: LayoutWindow,
  fixed: readonly Interval[],
  anchors: readonly AnchorInterval[],
  domainId: string | null | undefined,
): Interval[] {
  const blockingAnchors = anchors.filter(
    (anchor) => !anchor.domainId || anchor.domainId !== (domainId ?? null),
  );
  const blocked = unionIntervals([...fixed.map((b) => ({ start: b.start, end: b.end })), ...blockingAnchors]);
  return subtract({ start: window.start, end: window.end }, blocked);
}

const ENERGY_RANK: Record<'low' | 'med' | 'high', number> = { high: 0, med: 1, low: 2 };

function deterministicOrder(picks: readonly PickForLayout[]): PickForLayout[] {
  return [...picks].sort((a, b) => {
    const energyDiff = ENERGY_RANK[a.energy ?? 'med'] - ENERGY_RANK[b.energy ?? 'med'];
    if (energyDiff !== 0) return energyDiff;
    const created = a.createdAt.getTime() - b.createdAt.getTime();
    if (created !== 0) return created;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function noonBoundary(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  date.setHours(ENERGY_SPLIT_HOUR, 0, 0, 0);
  return date.getTime();
}

interface Slot {
  start: number;
  end: number;
}

/**
 * The first slot at or after `notBefore` that fits `duration`, snapped UP to the
 * step grid anchored at the window start (the gap rule can leave free space at
 * a non-step instant).
 */
function earliestSlot(
  free: readonly Interval[],
  duration: number,
  notBefore: number,
  step: number,
  gridOrigin: number,
): Slot | null {
  for (const interval of free) {
    const raw = Math.max(interval.start, notBefore);
    const steps = Math.ceil((raw - gridOrigin) / step);
    const start = gridOrigin + Math.max(0, steps) * step;
    if (start + duration <= interval.end) {
      return { start, end: start + duration };
    }
  }
  return null;
}

/**
 * Propose focus blocks for the picks that fit, plus the picks that do not.
 *
 * Deterministic over input order: the picks are sorted by energy preference,
 * then `createdAt`, then id before any slot is chosen, and each placed block
 * reserves its time (plus the minimum gap) for the picks that follow.
 */
export function proposeLayout(input: ProposeLayoutInput): LayoutResult {
  const stepMin = input.stepMin ?? DEFAULT_STEP_MIN;
  const step = stepMin * MINUTE_MS;
  const gap = MIN_GAP_MIN * MINUTE_MS;
  const earliestStart = snapUp(Math.max(input.now, input.window.start), stepMin);
  if (earliestStart >= input.window.end) {
    return { blocks: [], unplaced: [...input.picks] };
  }
  const window: LayoutWindow = { start: earliestStart, end: input.window.end };
  const noon = noonBoundary(window.start);

  const reserved: Interval[] = input.fixedBlocks.map((block) => ({ start: block.start, end: block.end }));
  const blocks: ProposedBlock[] = [];
  const unplaced: PickForLayout[] = [];

  for (const pick of deterministicOrder(input.picks)) {
    const estimate = pick.estimateMin ?? DEFAULT_PICK_MINUTES;
    const duration = Math.max(step, Math.ceil((estimate * MINUTE_MS) / step) * step);
    const free = freeForDomain(window, reserved, input.anchors, pick.domainId);
    const energy = pick.energy ?? 'med';

    let slot: Slot | null = null;
    if (energy === 'high') {
      // Best: the pick finishes by noon. Otherwise the earliest slot anywhere.
      const beforeNoon = free
        .filter((interval) => interval.start < noon)
        .map((interval) => ({ start: interval.start, end: Math.min(interval.end, noon) }))
        .filter((interval) => interval.end - interval.start >= duration);
      slot =
        earliestSlot(beforeNoon, duration, window.start, step, window.start) ??
        earliestSlot(free, duration, window.start, step, window.start);
    } else if (energy === 'low') {
      slot =
        earliestSlot(free, duration, Math.max(window.start, noon), step, window.start) ??
        earliestSlot(free, duration, window.start, step, window.start);
    } else {
      slot = earliestSlot(free, duration, window.start, step, window.start);
    }

    if (!slot) {
      unplaced.push(pick);
      continue;
    }

    blocks.push({ taskId: pick.id, start: slot.start, end: slot.end });
    // Keep the minimum gap from the next block.
    reserved.push({ start: slot.start - gap, end: slot.end + gap });
  }

  blocks.sort((a, b) => a.start - b.start || (a.taskId < b.taskId ? -1 : 1));
  return { blocks, unplaced };
}

/**
 * Re-lay the picks that have not started into the free time that remains.
 * Blocks that already started (or finished) are kept untouched; picks that do
 * not fit come back as `overflow`.
 */
export function replanFromNow(input: ReplanInput): ReplanResult {
  const stepMin = input.stepMin ?? DEFAULT_STEP_MIN;
  const kept = input.existingFocusBlocks.filter((block) => block.start <= input.now);
  const keptTaskIds = new Set(
    input.existingFocusBlocks.map((block) => block.taskId).filter((id): id is string => typeof id === 'string'),
  );

  // Picks still to place: the ones asked for, minus any already kept/started.
  const remaining = input.picks.filter((pick) => !keptTaskIds.has(pick.id));

  const proposal = proposeLayout({
    picks: remaining,
    window: input.window,
    fixedBlocks: [...input.fixedBlocks, ...kept.map((block) => ({ start: block.start, end: block.end }))],
    anchors: input.anchors,
    now: input.now,
    stepMin,
  });

  return { relaid: proposal.blocks, kept, overflow: proposal.unplaced };
}

export interface Conflict {
  readonly kind: 'overlap' | 'out-of-window';
  readonly description: string;
  readonly blocks: readonly Interval[];
}

/** Overlapping pairs and blocks outside the waking window, with neutral wording. */
export function detectConflicts(blocks: readonly Interval[], window: LayoutWindow): Conflict[] {
  const conflicts: Conflict[] = [];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    if (a.start < window.start || a.end > window.end) {
      conflicts.push({
        kind: 'out-of-window',
        description: 'This block sits partly outside your waking hours.',
        blocks: [a],
      });
    }
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]!;
      if (b.start >= a.end) break;
      conflicts.push({
        kind: 'overlap',
        description: 'These two blocks share time. You can move or shorten one.',
        blocks: [a, b],
      });
    }
  }
  return conflicts;
}
