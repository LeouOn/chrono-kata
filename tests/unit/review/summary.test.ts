import { describe, expect, it } from 'vitest';
import { buildReviewSummaryRequest, scrubSessionForSummary, summaryToNotes } from '@/lib/review/summary';
import { buildWeeklyReflectionUserText } from '@/lib/llm/prompt-builders';
import { NOTES_MAX } from '@/lib/review/limits';
import type { Session } from '@/lib/schemas/session';

function session(patch: Partial<Session> & { id: string; startedAt: Date }): Session {
  return {
    rating: 4,
    durationMinutes: 30,
    reps: null,
    createdAt: patch.startedAt,
    updatedAt: patch.startedAt,
    ...patch,
  } as Session;
}

const WEEK_SESSIONS = [
  session({
    id: '11111111-1111-4111-8111-111111111111',
    startedAt: new Date('2026-06-16T09:00:00'),
    activityLabel: 'Trading journal',
    note: 'a private note about my position sizing and losses',
  }),
  session({
    id: '22222222-2222-4222-8222-222222222222',
    startedAt: new Date('2026-06-17T18:00:00'),
    activityLabel: 'Practice',
    durationMinutes: null,
    reps: 20,
    outcome: 'blocked',
  }),
];

describe('what leaves the device', () => {
  it('never carries session notes', () => {
    const scrubbed = scrubSessionForSummary(WEEK_SESSIONS[0]!);
    expect(scrubbed.note).toBeUndefined();
    expect((scrubbed as Record<string, unknown>).note).toBeUndefined();
  });

  it('shows exactly the text the generation call sends, built from the same scrubbed rows', () => {
    const request = buildReviewSummaryRequest(WEEK_SESSIONS);
    expect(request.sessions).toHaveLength(2);
    expect(request.userText).toBe(buildWeeklyReflectionUserText(request.sessions));
    expect(request.userText).not.toContain('a private note');
    // The practice vocabulary is what the summary is about, so it stays.
    expect(request.userText).toContain('Trading journal');
    expect(request.userText).toContain('Total sessions: 2');
    // No task or project titles exist in a session row to leak.
    expect(request.userText).not.toContain('title');
  });

  it('does not mutate the sessions it previews', () => {
    const request = buildReviewSummaryRequest(WEEK_SESSIONS);
    expect(WEEK_SESSIONS[0]?.note).toBe('a private note about my position sizing and losses');
    expect(request.sessions[0]).not.toBe(WEEK_SESSIONS[0]);
  });
});

describe('summaryToNotes', () => {
  it('appends the summary below the user’s own writing', () => {
    const result = summaryToNotes('My own words.', {
      observations: ['Trading got more time than practice.', 'Practice stalled twice.'],
      question: 'What would make practice easier to start?',
    });
    expect(result.trimmed).toBe(false);
    expect(result.notes).toBe(
      [
        'My own words.',
        '',
        'From the weekly summary:',
        '- Trading got more time than practice.',
        '- Practice stalled twice.',
        '',
        'Question to sit with: What would make practice easier to start?',
      ].join('\n'),
    );
  });

  it('drops blank observations and keeps at most five', () => {
    const result = summaryToNotes('', {
      observations: ['one', '  ', 'two', 'three', 'four', 'five', 'six'],
      question: '',
    });
    expect(result.notes.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(5);
    expect(result.notes).not.toContain('six');
  });

  it('trims the summary, never the notes, when the bound is reached', () => {
    const notes = 'x'.repeat(NOTES_MAX - 200);
    const result = summaryToNotes(notes, {
      observations: ['a'.repeat(200)],
      question: 'q',
    });
    expect(result.trimmed).toBe(true);
    expect(result.notes.length).toBeLessThanOrEqual(NOTES_MAX);
    // The user's writing survives in full; the regenerable part is cut.
    expect(result.notes.startsWith(notes)).toBe(true);
    expect(result.notes).toContain('From the weekly summary:');
    expect(result.notes.endsWith('…')).toBe(true);
  });

  it('leaves the notes exactly as they were when there is no room for a heading', () => {
    const noRoom = summaryToNotes('y'.repeat(NOTES_MAX), { observations: ['one'], question: '' });
    expect(noRoom).toEqual({ notes: 'y'.repeat(NOTES_MAX), trimmed: true });

    // Ten characters of room is not enough for the heading: not even a stub.
    const tenChars = summaryToNotes('z'.repeat(NOTES_MAX - 10), { observations: ['one'], question: '' });
    expect(tenChars.trimmed).toBe(true);
    expect(tenChars.notes).toBe('z'.repeat(NOTES_MAX - 10));
  });

  it('returns the notes untouched for an empty summary', () => {
    const result = summaryToNotes('kept', { observations: [], question: '' });
    expect(result).toEqual({ notes: 'kept', trimmed: false });
  });
});
