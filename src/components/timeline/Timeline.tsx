'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Block } from '@/lib/schemas/block';
import type { AnchorInterval as DatedAnchor } from '@/lib/planning/anchors';
import { moveBlock, resizeBlock, type Interval } from '@/lib/planning/layout';

const MIN = 60_000;
const PX_PER_MIN = 1.1;

/**
 * Local wall-clock hour boundaries inside [start, end]. Anchoring at whole UTC
 * hours puts the lines at :30 in India (UTC+5:30) and :45 in Nepal (UTC+5:45),
 * and hides the window's own start label. A DST fall-back day repeats 01:00,
 * which is truthful and must stay.
 */
export function localHourMarks(start: number, end: number): number[] {
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  let cursor = first.getTime();
  if (cursor < start) cursor += 60 * MIN;
  const marks: number[] = [];
  for (let instant = cursor; instant <= end; instant += 60 * MIN) marks.push(instant);
  return marks;
}

export interface TimelineBlock {
  id: string;
  kind: 'fixed' | 'anchor' | 'focus';
  title: string;
  start: number;
  end: number;
  block?: Block;
  domainId?: string | null;
  lane?: number;
  laneCount?: number;
}

interface Props {
  window: { start: number; end: number };
  blocks: TimelineBlock[];
  ghostBlocks?: { taskId: string; start: number; end: number; title: string }[];
  now: number;
  onSelect: (entry: TimelineBlock) => void;
  /** Commit a drag/resize. Without it, blocks are read-only and only tap works. */
  onCommit?: (entry: TimelineBlock, next: Interval) => void | Promise<void>;
  stepMin?: number;
}

interface DragState {
  entry: TimelineBlock;
  mode: 'move' | 'start' | 'end';
  originY: number;
  preview: Interval;
}

function clock(instant: number): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * One-column day timeline. Blocks with `lane`/`laneCount` are drawn side by
 * side so an overlapping block is never covered and always tappable (W7 PR 3).
 * One Pointer Events path serves mouse and touch; moving is also possible from
 * the keyboard (Alt+arrows) and the tap-to-edit sheet, so drag is never the
 * only way. Resize handles carry `touch-action: none`; the block body keeps
 * `pan-y` so a vertical swipe still scrolls the page on a phone.
 */
export function Timeline({ window, blocks, ghostBlocks = [], now, onSelect, onCommit, stepMin = 15 }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  function begin(event: React.PointerEvent, entry: TimelineBlock, mode: DragState['mode']) {
    if (!onCommit || entry.kind === 'anchor') return;
    // No preventDefault here: on touch, canceling pointerdown also suppresses the
    // compatibility click, so a tap would not open the sheet. Movement is
    // prevented once a drag actually starts.
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const next: DragState = {
      entry,
      mode,
      originY: event.clientY,
      preview: { start: entry.start, end: entry.end },
    };
    // Write the ref synchronously: a fast tap can deliver pointerup before the
    // next render, and touchscreen taps in particular may not wait for one.
    dragRef.current = next;
    setDrag(next);
  }

  function move(event: React.PointerEvent) {
    const current = dragRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaMs = Math.round(((event.clientY - current.originY) / PX_PER_MIN) / 1) * MIN;
    const base = { start: current.entry.start, end: current.entry.end };
    const preview =
      current.mode === 'move'
        ? moveBlock(base, deltaMs, window, stepMin)
        : resizeBlock(
            base,
            current.mode === 'start' ? 'start' : 'end',
            (current.mode === 'start' ? base.start : base.end) + deltaMs,
            window,
            stepMin,
          );
    const next = { ...current, preview };
    dragRef.current = next;
    setDrag(next);
  }

  function finish(event: React.PointerEvent) {
    const current = dragRef.current;
    if (!current) return;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDrag(null);
    suppressClickRef.current = true;
    const changed =
      current.preview.start !== current.entry.start || current.preview.end !== current.entry.end;
    if (changed) void onCommit?.(current.entry, current.preview);
    // Let the compatibility click pass through (and be swallowed above) before
    // the sheet opens; otherwise that click lands on the new backdrop and
    // closes it again.
    else globalThis.setTimeout(() => onSelect(current.entry), 0);
  }

  function cancel() {
    dragRef.current = null;
    setDrag(null);
  }

  function keydown(event: React.KeyboardEvent, entry: TimelineBlock) {
    if (!onCommit || entry.kind === 'anchor') return;
    if (!event.altKey) return;
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const delta = direction * stepMin * MIN;
    const base = { start: entry.start, end: entry.end };
    const next = event.shiftKey
      ? resizeBlock(base, 'end', base.end + delta, window, stepMin)
      : moveBlock(base, delta, window, stepMin);
    void onCommit(entry, next);
  }
  const minutes = Math.max(1, (window.end - window.start) / MIN);
  const height = Math.round(minutes * PX_PER_MIN);
  const top = (instant: number) =>
    Math.max(0, Math.min(height, Math.round(((instant - window.start) / MIN) * PX_PER_MIN)));
  const hours = localHourMarks(window.start, window.end);

  return (
    <div className="flex gap-2" data-testid="timeline">
      <div className="w-10 shrink-0 relative" style={{ height }} aria-hidden="true">
        {hours.map((instant) => (
          <div
            key={instant}
            className="absolute right-1 -translate-y-1/2 text-[10px] text-text-muted"
            style={{ top: top(instant) }}
          >
            {clock(instant)}
          </div>
        ))}
      </div>
      <div className="relative flex-1 rounded-2xl border border-border bg-surface" style={{ height }}>
        {hours.map((instant) => (
          <div
            key={instant}
            className="absolute left-0 right-0 border-t border-border/40"
            style={{ top: top(instant) }}
            aria-hidden="true"
          />
        ))}
        {now >= window.start && now <= window.end ? (
          <div
            className="absolute left-0 right-0 border-t-2 border-accent"
            style={{ top: top(now) }}
            aria-label={`Now ${clock(now)}`}
          />
        ) : null}

        {blocks.map((entry) => {
          const active = drag && drag.entry.id === entry.id ? drag.preview : entry;
          const topPx = top(active.start);
          const heightPx = Math.max(18, top(active.end) - topPx);
          const lane = entry.lane ?? 0;
          const laneCount = Math.max(1, entry.laneCount ?? 1);
          const className =
            entry.kind === 'fixed'
              ? 'bg-surface-2 border-border'
              : entry.kind === 'anchor'
                ? 'bg-accent/10 border-accent/40'
                : 'bg-accent/20 border-accent';
          return (
            <React.Fragment key={entry.id}>
            <button
              type="button"
              onPointerDown={(event) => begin(event, entry, 'move')}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={cancel}
              onClick={() => {
                if (entry.kind !== 'anchor' && suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelect(entry);
              }}
              onKeyDown={(event) => keydown(event, entry)}
              aria-label={`${entry.kind} block ${entry.title} ${clock(active.start)} to ${clock(active.end)}`}
              aria-describedby="timeline-hint"
              className={`absolute overflow-hidden rounded-xl border px-2 py-1 text-left text-[11px] text-text min-h-11 ${className}`}
              style={{
                top: topPx,
                height: heightPx,
                left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                width: `calc(${100 / laneCount}% - 4px)`,
                touchAction: 'pan-y',
              }}
            >
              <span className="block truncate font-medium">{entry.title}</span>
              <span className="block truncate text-text-muted">
                {clock(active.start)}–{clock(active.end)}
              </span>
            </button>
            {onCommit && entry.kind !== 'anchor' ? (
              <>
                <button
                  type="button"
                  aria-label={`Resize start of ${entry.title}`}
                  onPointerDown={(event) => begin(event, entry, 'start')}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onPointerCancel={cancel}
                  className="absolute z-10 rounded-full bg-accent/70"
                  style={{
                    left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                    width: `calc(${100 / laneCount}% - 4px)`,
                    top: Math.max(0, topPx - 3),
                    height: 10,
                    touchAction: 'none',
                  }}
                />
                <button
                  type="button"
                  aria-label={`Resize end of ${entry.title}`}
                  onPointerDown={(event) => begin(event, entry, 'end')}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onPointerCancel={cancel}
                  className="absolute z-10 rounded-full bg-accent/70"
                  style={{
                    left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                    width: `calc(${100 / laneCount}% - 4px)`,
                    top: Math.max(0, topPx + heightPx - 7),
                    height: 10,
                    touchAction: 'none',
                  }}
                />
              </>
            ) : null}
            </React.Fragment>
          );
        })}

        {ghostBlocks.map((ghost) => {
          const topPx = top(ghost.start);
          const heightPx = Math.max(18, top(ghost.end) - topPx);
          return (
            <div
              key={`ghost-${ghost.taskId}`}
              className="pointer-events-none absolute left-1 right-1 overflow-hidden rounded-xl border border-dashed border-accent bg-accent/5 px-2 py-1 text-[11px] text-text-muted"
              style={{ top: topPx, height: heightPx }}
              aria-hidden="true"
            >
              <span className="block truncate">{ghost.title}</span>
              <span className="block truncate">
                {clock(ghost.start)}–{clock(ghost.end)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Convert stored blocks and settings anchors into timeline entries. */
export function toTimelineBlocks(blocks: readonly Block[], anchors: readonly DatedAnchor[]): TimelineBlock[] {
  return [
    ...blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title,
      start: block.start.getTime(),
      end: block.end.getTime(),
      block,
    })),
    ...anchors.map((anchor) => ({
      id: `anchor-${anchor.id}`,
      kind: 'anchor' as const,
      title: anchor.title,
      start: anchor.start.getTime(),
      end: anchor.end.getTime(),
      domainId: anchor.domainId,
    })),
  ];
}
