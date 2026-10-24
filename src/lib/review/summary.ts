import { buildWeeklyReflectionUserText } from '@/lib/llm/prompt-builders';
import { NOTES_MAX } from './limits';
import type { Session } from '@/lib/schemas/session';

/**
 * The optional AI summary of a review (roadmap Wave 11, step "what moved, what
 * stalled, one suggestion").
 *
 * It reuses the existing weekly reflection (same prompt builder, same
 * generation call) rather than writing a second summarizer, and it makes the
 * wire text a value that can be shown before anything is sent.
 *
 * What may leave the device:
 * - the reviewed week's session rows, with each `note` **removed** (session
 *   notes are free writing, and the aggregate is what the summary is for);
 * - the shared reflection instruction and the coach system prompt.
 *
 * Task and project titles are never part of the reflection text, so they can
 * not leak by accident. Nothing here reads the database or the network.
 */

export interface ReviewSummaryRequest {
  /** The sessions whose text would be sent, with private writing removed. */
  sessions: Session[];
  /** Exactly the user-side text that leaves the device. */
  userText: string;
}

/** Strip the fields the summary does not need from a session copy. */
export function scrubSessionForSummary(session: Session): Session {
  const { note: _note, ...rest } = session;
  return rest;
}

/**
 * Build the exact request the review summary would send for one week.
 *
 * The text is produced by the SAME builder the generation call uses, from the
 * SAME scrubbed sessions, so the preview shown to the user cannot drift from
 * what is transmitted.
 */
export function buildReviewSummaryRequest(sessions: readonly Session[]): ReviewSummaryRequest {
  const scrubbed = sessions.map(scrubSessionForSummary);
  return { sessions: scrubbed, userText: buildWeeklyReflectionUserText(scrubbed) };
}

export interface ReviewSummaryText {
  observations: string[];
  question: string;
}

export interface NotesWithSummary {
  notes: string;
  /** True when the summary had to be trimmed or left out to protect the notes. */
  trimmed: boolean;
}

/**
 * Render a returned summary as notes text, bounded to what the review stores.
 *
 * Appending (rather than replacing) keeps the user's own writing, and the user's
 * writing is what wins the space when the bound is reached: the summary is
 * regenerable, the notes are not. When there is no room at all, the notes are
 * returned exactly as they were and `trimmed` says so.
 */
export function summaryToNotes(
  existingNotes: string,
  summary: ReviewSummaryText,
  max: number = NOTES_MAX,
): NotesWithSummary {
  const observations = summary.observations
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 5);
  const question = summary.question.trim();
  const base = existingNotes.trim();
  if (observations.length === 0 && question === '') {
    return { notes: existingNotes.slice(0, max), trimmed: existingNotes.length > max };
  }

  const block = [
    'From the weekly summary:',
    ...observations.map((line) => `- ${line}`),
    ...(question === '' ? [] : ['', `Question to sit with: ${question}`]),
  ].join('\n');

  const separator = base === '' ? '' : '\n\n';
  const room = max - base.length - separator.length;
  // Not enough room for the heading plus at least one short line: leave the
  // notes exactly as they are rather than pasting a half sentence onto them.
  const MIN_BLOCK = 'From the weekly summary:\n- x'.length;
  if (room < MIN_BLOCK) return { notes: base.slice(0, max), trimmed: true };

  if (block.length <= room) {
    return { notes: `${base}${separator}${block}`, trimmed: false };
  }
  const kept = block.slice(0, Math.max(0, room - 1)).trimEnd();
  return { notes: `${base}${separator}${kept}…`, trimmed: true };
}
