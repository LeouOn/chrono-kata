import { z } from 'zod';

/**
 * The daily journal template (roadmap Wave 12).
 *
 * A template is markdown the person owns: it is stored on the settings row
 * (`journalTemplate`), bounded, and rendered into the day's journal field when
 * they start writing. Rendering is pure: the same template and context produce
 * the same text, and unknown `{{placeholders}}` are left exactly as written so
 * the person can keep their own conventions.
 */

/** Matches `SettingsSchema.journalTemplate`'s bound; one number, two schemas. */
export const JOURNAL_TEMPLATE_MAX = 20_000;

/** Matches `DayPlanSchema.journal`'s bound. */
export const JOURNAL_TEXT_MAX = 5000;

/** Matches `DayPlanSchema.shutdownNote`'s bound. */
export const SHUTDOWN_NOTE_MAX = 2000;

/** Matches `DayPlanSchema.firstActionTomorrow`'s bound. */
export const FIRST_ACTION_MAX = 500;

export const JOURNAL_PLACEHOLDERS = ['date', 'weekday', 'domains'] as const;
export type JournalPlaceholder = (typeof JOURNAL_PLACEHOLDERS)[number];

export const DEFAULT_JOURNAL_TEMPLATE = `## {{date}}

What happened today:
- 

What I noticed:
- 

Energy (1–5): 

Tomorrow's first move: 

### Domains
{{domains}}
`;

export interface JournalTemplateContext {
  /** The local day key, e.g. 2026-06-15. */
  date: string;
  /** A human weekday name for that local day, e.g. "Monday". */
  weekday: string;
  /** The person's domains, in display order; rendered as checkbox lines. */
  domains: readonly { id: string; name: string }[];
}

/**
 * Normalise line endings and drop trailing blank lines, without touching the
 * content: trailing spaces on the last line can be a markdown hard break, so
 * only whole empty lines are removed.
 */
export function normaliseMultiline(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  return lines.join('\n');
}

/**
 * Render a template for one day.
 *
 * `{{date}}`, `{{weekday}}` and `{{domains}}` are substituted; every other
 * `{{...}}` is left untouched. Domains are rendered in the order given (the
 * caller sorts them), so the same context always produces the same bytes.
 */
export function renderJournalTemplate(template: string, context: JournalTemplateContext): string {
  const domains = context.domains
    .map((domain) => `- [ ] ${domain.name}`)
    .join('\n');
  return normaliseMultiline(
    template
      .split('{{date}}').join(context.date)
      .split('{{weekday}}').join(context.weekday)
      .split('{{domains}}').join(domains),
  );
}

export type NormaliseResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validate text that will be persisted, on the NORMALISED value.
 *
 * Returns the normalised text or a calm sentence. Nothing here truncates: a
 * value that does not fit is refused so the caller can say so, rather than
 * being silently cut in half.
 */
export function normaliseJournalText(raw: string, max: number = JOURNAL_TEXT_MAX): NormaliseResult {
  const value = normaliseMultiline(raw);
  if (value.length > max) {
    return { ok: false, error: `That is longer than ${max.toLocaleString()} characters. Trim it a little.` };
  }
  return { ok: true, value };
}

/**
 * Import a markdown template from a file.
 *
 * Line endings are normalised, the ends are trimmed, and an empty file is
 * refused rather than replacing the person's template with nothing.
 */
export function importJournalTemplate(raw: string): NormaliseResult {
  const value = normaliseMultiline(raw).trim();
  if (value === '') return { ok: false, error: 'That file is empty, so there is nothing to import.' };
  if (value.length > JOURNAL_TEMPLATE_MAX) {
    return {
      ok: false,
      error: `A template can be at most ${JOURNAL_TEMPLATE_MAX.toLocaleString()} characters; this file is longer.`,
    };
  }
  return { ok: true, value };
}

/** The saved template, or the app default when none was saved. */
export function resolveJournalTemplate(saved: string | null | undefined): string {
  if (typeof saved !== 'string') return DEFAULT_JOURNAL_TEMPLATE;
  const trimmed = normaliseMultiline(saved);
  return trimmed.trim() === '' ? DEFAULT_JOURNAL_TEMPLATE : trimmed;
}

/** Schema for a stored template value, shared with settings validation. */
export const JournalTemplateSchema = z.string().max(JOURNAL_TEMPLATE_MAX);
