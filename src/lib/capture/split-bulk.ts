/**
 * Bulk paste splitting for capture (roadmap Wave 2).
 *
 * A messy multi-line paste becomes one item per line: bullets, numbered items,
 * checkboxes and indentation are stripped; indented non-bullet lines continue
 * the previous item. Empty lines separate items but produce nothing.
 *
 * `splitBulk` returns the cleaned lines; `parseBulk` runs `parseCapture` on
 * each one and keeps a stable `index` (the position in the returned array) so a
 * preview UI can drop or edit individual items before saving.
 */

import { parseCapture, type ParseCaptureOptions, type ParsedCapture } from './parse-capture';

const BULLET = /^[-*•]\s+/;
const CHECKBOX = /^\[\s*[xX]?\s*\]\s*/;
const NUMBERED = /^\d+[.)]\s+/;
/** Trailing `;` and `,` are paste noise; a trailing period may be the sentence. */
const STRIPPED_TRAILING = /[;,]+$/;

function trimLeft(value: string): string {
  return value.replace(/^[ \t]+/, '');
}

function hasMarker(line: string): boolean {
  const left = trimLeft(line);
  return BULLET.test(left) || CHECKBOX.test(left) || NUMBERED.test(left);
}

function stripMarker(line: string): string {
  let rest = trimLeft(line);
  // A line can stack markers: "- [ ] buy milk", "1. • call plumber".
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of [BULLET, CHECKBOX, NUMBERED]) {
      const next = rest.replace(pattern, '');
      if (next !== rest) {
        rest = trimLeft(next);
        changed = true;
      }
    }
  }
  return rest.replace(STRIPPED_TRAILING, '').trim();
}

/**
 * Split a pasted blob into item lines.
 *
 * - Blank lines are separators, never items.
 * - Bullet/number/checkbox markers are removed, as are trailing `;` and `,`
 *   (a trailing period is kept: it can be part of the sentence).
 * - An indented line that is not itself a new marker is a continuation of the
 *   previous item (wrapped text from a copy/paste).
 */
export function splitBulk(text: string): string[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const items: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const indented = /^[ \t]+/.test(line);
    if (indented && !hasMarker(line) && items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${stripMarker(line)}`.trim();
      continue;
    }

    const item = stripMarker(line);
    if (item !== '') items.push(item);
  }

  return items;
}

export interface BulkCaptureItem {
  /** Stable position in the returned array, for a preview UI to address rows. */
  index: number;
  /** The cleaned line the parser saw. */
  line: string;
  parsed: ParsedCapture;
}

/** `splitBulk` + `parseCapture` per line, keeping a stable index. */
export function parseBulk(text: string, options: ParseCaptureOptions): BulkCaptureItem[] {
  return splitBulk(text).map((line, index) => ({
    index,
    line,
    parsed: parseCapture(line, options),
  }));
}
