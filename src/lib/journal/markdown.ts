/**
 * Text safety for the journal's markdown (roadmap Wave 12).
 *
 * Two shapes of user text need two rules:
 *
 * - **Block text** (the journal, the shutdown note, tomorrow's first move) is
 *   multi-line, so it is quoted: every line gets `> `, and a blank line becomes
 *   `>`. It stays readable, and no line of it can start a heading, list, rule,
 *   table or code fence in the surrounding document.
 * - **Inline text** (a task title, a domain name) has to stay on one list-item
 *   line, so it is flattened and escaped: markdown specials are backslash-
 *   escaped and `<` / `>` / `&` become entities. Task titles are not only typed
 *   by the person — the share target, the calendar import and AI decomposition
 *   all produce them — so this is external text, and rendered markdown shows the
 *   original characters back.
 */

/** Every line of multi-line user text, quoted so it cannot change the structure. */
export function quoteBlock(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

/**
 * Bidirectional control characters: RLO/LRO/PDF and the isolate set can visually
 * reverse or reorder the text around them in some viewers. They cannot create
 * markdown structure, but they can make a title read as something else, so they
 * are removed rather than escaped.
 */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** One line of user text, flattened and escaped so it stays one inert list item. */
export function escapeInline(text: string): string {
  return text
    .replace(BIDI_CONTROLS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]()#+.!|~-])/g, '\\$1');
}
