/**
 * The bridge from a parsed capture to the Wave 1 task contract.
 *
 * `parseCapture` is deliberately schema-agnostic: it returns a local day-key
 * string for dates and an empty title for an empty line. A capture UI must not
 * hand those straight to `TaskInputSchema`, so this module does the conversion
 * once, and is the tested contract Wave 2 part 2 builds on:
 *
 * - `deferUntil` is a local `YYYY-MM-DD` key -> `Date` at local midday (never
 *   UTC midnight, which is the previous day west of Greenwich).
 * - An empty title (empty/whitespace input) yields `null`, not an invalid row.
 * - `status` starts as `'inbox'`, `source` defaults to `'manual'`.
 */

import { TaskInputSchema, type TaskInput, type TaskSource } from '@/lib/schemas/task';
import type { ParsedCapture } from './parse-capture';

/** Local midday for a `YYYY-MM-DD` key, so the day never shifts across a DST edge. */
export function localDayKeyToDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year!, month! - 1, day!, 12);
}

/**
 * Build a schema-valid `TaskInput` from a parsed capture, or `null` when there
 * is nothing to save (empty line, or a line that reduces to an empty title).
 */
export function captureToTaskInput(
  parsed: ParsedCapture,
  options: { source?: TaskSource } = {},
): TaskInput | null {
  const title = parsed.title.trim();
  if (title === '') return null;

  return TaskInputSchema.parse({
    title,
    status: 'inbox',
    source: options.source ?? 'manual',
    domainId: parsed.domainId,
    estimateMin: parsed.estimateMin,
    energy: parsed.energy,
    context: parsed.contexts.length > 0 ? parsed.contexts : null,
    deferUntil: parsed.deferUntil ? localDayKeyToDate(parsed.deferUntil) : null,
  });
}
