/**
 * ICS export for Blocks (roadmap Wave 8 part 1).
 *
 * Time encoding: **UTC instants** (`DTSTART:…Z`). `Block.start`/`Block.end` are
 * absolute instants, and UTC is the only encoding that needs no VTIMEZONE, is
 * understood by every calendar app, and round-trips to the identical block when
 * the user moves between time zones. A wall-clock (floating) encoding would
 * instead re-anchor the block to the new device zone; a TZID encoding would
 * also be correct but forces VTIMEZONE generation and buys nothing for an
 * instant we already know. See docs/waves/wave-08.md.
 *
 * Output is deterministic for the same blocks and `now`: stable UIDs (from
 * `calendarRef`, else the block id, so re-export updates rather than
 * duplicates), sorted events, CRLF, 75-octet folding.
 */

import type { Block } from '@/lib/schemas/block';

export interface IcsExportOptions {
  /** Injected clock for DTSTAMP, so exports are deterministic in tests. */
  now: Date;
  /** Calendar display name (X-WR-CALNAME). */
  calendarName?: string;
}

const PRODID = '-//chrono-kata//chrono-kata//EN';
/** RFC 5545: each physical line is at most 75 octets, excluding CRLF. */
const MAX_LINE_OCTETS = 75;

/** Escape TEXT per RFC 5545 §3.3.11 (backslash first). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line at 75 octets without splitting a UTF-8 sequence.
 * Continuation lines start with one space, so their content budget is 74.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let current = '';
  let octets = 0;
  let budget = MAX_LINE_OCTETS;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > budget) {
      parts.push(current);
      current = '';
      octets = 0;
      budget = MAX_LINE_OCTETS - 1; // continuation lines carry a leading space
    }
    current += char;
    octets += size;
  }
  if (current !== '') parts.push(current);
  return parts.join('\r\n ');
}

/** `YYYYMMDDTHHMMSSZ` in UTC. */
export function formatIcsUtc(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Stable UID: an existing `calendarRef` wins so re-export updates the same event. */
export function blockUid(block: Block): string {
  const ref = block.calendarRef?.trim();
  return ref && ref.length > 0 ? ref : `${block.id}@chrono-kata`;
}

function eventLines(block: Block, now: Date): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(blockUid(block))}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(block.start)}`,
    `DTEND:${formatIcsUtc(block.end)}`,
    `SUMMARY:${escapeIcsText(block.title)}`,
    `X-CHRONO-KATA-KIND:${block.kind}`,
    `X-CHRONO-KATA-BLOCK-ID:${block.id}`,
  ];
  if (block.taskId) lines.push(`X-CHRONO-KATA-TASK-ID:${block.taskId}`);
  if (block.projectId) lines.push(`X-CHRONO-KATA-PROJECT-ID:${block.projectId}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Serialize blocks as one VCALENDAR. Events are ordered by start (then id) so
 * the output is byte-identical for the same input.
 */
export function blocksToIcs(blocks: readonly Block[], options: IcsExportOptions): string {
  const ordered = [...blocks].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id),
  );

  const raw: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.calendarName ?? 'chrono-kata')}`,
  ];
  for (const block of ordered) raw.push(...eventLines(block, options.now));
  raw.push('END:VCALENDAR');

  return `${raw.map(foldIcsLine).join('\r\n')}\r\n`;
}
