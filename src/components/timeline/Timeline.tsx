'use client';

import React from 'react';
import type { Block } from '@/lib/schemas/block';
import type { AnchorInterval as DatedAnchor } from '@/lib/planning/anchors';

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
}

interface Props {
  window: { start: number; end: number };
  blocks: TimelineBlock[];
  ghostBlocks?: { taskId: string; start: number; end: number; title: string }[];
  now: number;
  onSelect: (entry: TimelineBlock) => void;
}

function clock(instant: number): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * One-column day timeline (roadmap W7 PR 2). Phase 2 is read + tap-to-edit; the
 * pointer drag/resize layer is PR 3, which will use this geometry.
 */
export function Timeline({ window, blocks, ghostBlocks = [], now, onSelect }: Props) {
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
          const topPx = top(entry.start);
          const heightPx = Math.max(18, top(entry.end) - topPx);
          const className =
            entry.kind === 'fixed'
              ? 'bg-surface-2 border-border'
              : entry.kind === 'anchor'
                ? 'bg-accent/10 border-accent/40'
                : 'bg-accent/20 border-accent';
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry)}
              aria-label={`${entry.kind} block ${entry.title} ${clock(entry.start)} to ${clock(entry.end)}`}
              className={`absolute left-1 right-1 overflow-hidden rounded-xl border px-2 py-1 text-left text-[11px] text-text min-h-11 ${className}`}
              style={{ top: topPx, height: heightPx }}
            >
              <span className="block truncate font-medium">{entry.title}</span>
              <span className="block truncate text-text-muted">
                {clock(entry.start)}–{clock(entry.end)}
              </span>
            </button>
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
