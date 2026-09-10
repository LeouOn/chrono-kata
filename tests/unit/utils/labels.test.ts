import { describe, it, expect } from 'vitest';
import { buildLabelSuggestions, LABEL_SUGGESTION_LIMIT } from '@/lib/utils/labels';
import type { Session } from '@/lib/schemas/session';
import type { KataTemplate } from '@/lib/schemas/kata-template';

function makeSession(label: string | undefined, startedAt: Date): Session {
  return {
    id: crypto.randomUUID(),
    startedAt,
    endedAt: null,
    durationMinutes: 10,
    reps: null,
    rating: 3,
    activityLabel: label,
    note: undefined,
    coachComment: null,
    failedLLM: undefined,
    calendarEventId: null,
    focusRating: null,
    energyRating: null,
    moodRating: null,
    conversationId: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function makeTemplate(label: string): KataTemplate {
  return {
    id: crypto.randomUUID(),
    name: 'T',
    mode: 'timed',
    defaultDurationMinutes: 20,
    defaultReps: null,
    activityLabel: label,
    defaultNote: undefined,
    icon: '🥋',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('buildLabelSuggestions', () => {
  it('returns session labels newest-first, then template labels', () => {
    const older = makeSession('meditation', new Date('2026-01-01T10:00:00Z'));
    const newer = makeSession('kata', new Date('2026-02-01T10:00:00Z'));
    expect(buildLabelSuggestions([older, newer], [makeTemplate('Deep Work')], '')).toEqual([
      'kata',
      'meditation',
      'Deep Work',
    ]);
  });

  it('sorts by startedAt regardless of input order', () => {
    const older = makeSession('old', new Date('2026-01-01T10:00:00Z'));
    const newer = makeSession('new', new Date('2026-02-01T10:00:00Z'));
    expect(buildLabelSuggestions([older, newer], [], '')).toEqual(['new', 'old']);
  });

  it('dedupes case-insensitively and keeps the first casing seen', () => {
    const a = makeSession('Meditation', new Date('2026-01-02T10:00:00Z'));
    const b = makeSession('meditation', new Date('2026-01-01T10:00:00Z'));
    expect(buildLabelSuggestions([a, b], [], '')).toEqual(['Meditation']);
  });

  it('excludes the current input value case-insensitively', () => {
    const s = makeSession('Meditation', new Date());
    expect(buildLabelSuggestions([s], [], 'meditation')).toEqual([]);
  });

  it('caps at the limit, keeping the most recent', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession(`label-${i}`, new Date(2026, 0, i + 1))
    );
    const result = buildLabelSuggestions(sessions, [], '');
    expect(result).toHaveLength(LABEL_SUGGESTION_LIMIT);
    expect(result[0]).toBe('label-9');
  });

  it('skips undefined and blank labels', () => {
    const a = makeSession(undefined, new Date());
    const b = makeSession('   ', new Date());
    expect(buildLabelSuggestions([a, b], [makeTemplate('x')], '')).toEqual(['x']);
  });
});
