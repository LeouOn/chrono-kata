/**
 * The words the person reads before an import (Wave 18 part 2): specific, calm, tested as text.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, countOf, joinWords } from '@/lib/data-transfer/collections';
import type { MergeReport } from '@/lib/data-transfer/merge';
import {
  leftOutLine,
  mergeResultSentence,
  mergeSentence,
  previewRows,
  replaceSentence,
  singletonsReplaced,
  type DeviceCounts,
} from '@/lib/data-transfer/preview';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

const zero = () => Object.fromEntries(COLLECTIONS.map((c) => [c.key, 0])) as DeviceCounts;
const envelopeWith = (counts: Partial<Record<(typeof COLLECTIONS)[number]['key'], number>>, extra: Partial<ExportEnvelope> = {}): ExportEnvelope =>
  ({
    version: 2, exportedAt: '2026-10-24T12:00:00.000Z', sessions: [], reflections: [], streak: null, settings: null, llmSettings: null,
    ...Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, new Array(n).fill({})])),
    ...extra,
  }) as ExportEnvelope;

const GUILT = /overdue|behind|missed|failed|failure|lazy|should have|too late|warning|danger|careful|permanent|irreversible|lost forever|!/i;

describe('words', () => {
  it('counts with a fixed locale and the right singular', () => {
    expect(countOf(1, { singular: 'task', plural: 'tasks' })).toBe('1 task');
    expect(countOf(0, { singular: 'task', plural: 'tasks' })).toBe('0 tasks');
    expect(countOf(1310, { singular: 'session', plural: 'sessions' })).toBe('1,310 sessions');
    expect(joinWords([])).toBe('');
    expect(joinWords(['a'])).toBe('a');
    expect(joinWords(['a', 'b'])).toBe('a and b');
    expect(joinWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('the replace sentence', () => {
  it('says exactly what is replaced by what', () => {
    const device = { ...zero(), tasks: 214, sessions: 1310, projects: 12 };
    const rows = previewRows(envelopeWith({ tasks: 180, sessions: 1200, projects: 9, reflections: 0 }), device);
    expect(replaceSentence(rows)).toBe('This will replace 214 tasks, 1,310 sessions and 12 projects on this device with 180 tasks, 1,200 sessions and 9 projects from the file.');
  });

  it('names what the file does not carry and leaves alone', () => {
    const device = { ...zero(), tasks: 5, conversations: 2 };
    const rows = previewRows(envelopeWith({ tasks: 3 }), device);
    expect(replaceSentence(rows)).toBe('This will replace 5 tasks on this device with 3 tasks from the file. The file has no coach conversations, so the 2 coach conversations on this device stay.');
  });

  it('handles a device with nothing, and a file with nothing', () => {
    expect(replaceSentence(previewRows(envelopeWith({ tasks: 4 }), zero()))).toBe('This device has none of these yet. Restoring adds 4 tasks from the file.');
    expect(replaceSentence(previewRows(envelopeWith({ tasks: 0, sessions: 0 }), { ...zero(), tasks: 2 }))).toBe('This will remove 2 tasks from this device. The file has none of these.');
    expect(replaceSentence(previewRows(envelopeWith({}), zero()))).toBe('There is nothing on this device and nothing in the file to replace.');
  });

  it('lists a kind only when the device or the file has some', () => {
    const rows = previewRows(envelopeWith({ tasks: 1 }), { ...zero(), habits: 3 });
    expect(rows.map((r) => r.key).sort()).toEqual(['habits', 'tasks']);
    expect(rows.find((r) => r.key === 'habits')!.inFile).toBeNull();
  });
});

describe('the merge sentences', () => {
  const report = (parts: Partial<Record<(typeof COLLECTIONS)[number]['key'], [number, number, number]>>): MergeReport => ({
    collections: COLLECTIONS.filter((c) => parts[c.key]).map((c) => {
      const [added, same, differs] = parts[c.key]!;
      return { key: c.key, inFile: added + same + differs, added, same, differs };
    }),
  });

  it('says what is added and that the rest stays', () => {
    expect(mergeSentence(report({ tasks: [3, 4, 1], sessions: [10, 0, 0] }))).toBe(
      "This will add 3 tasks and 10 sessions to this device. 5 are already here and stay as they are; 1 of those differs from the file's copy, and yours is kept. Your settings, streak and AI settings are not changed.",
    );
  });

  it('copes with nothing new, and with exactly one already here', () => {
    expect(mergeSentence(report({ tasks: [0, 1, 0] }))).toBe('There is nothing new in the file to add. 1 is already here and stays as it is. Your settings, streak and AI settings are not changed.');
    expect(mergeSentence(report({}))).toBe('There is nothing new in the file to add. Your settings, streak and AI settings are not changed.');
  });

  it('reports the result in the past tense', () => {
    expect(mergeResultSentence(report({ tasks: [3, 4, 1], sessions: [10, 0, 0] }))).toBe('Added 3 tasks and 10 sessions. 5 already here, left as they were (1 differed from the file; yours were kept).');
    expect(mergeResultSentence(report({ tasks: [0, 0, 0] }))).toBe('Nothing new to add.');
  });
});

describe('what the file leaves out, and which records a replace swaps', () => {
  it('reads as one sentence', () => {
    expect(leftOutLine([
      { id: 'llmSettings.apiKey', what: 'your API keys', why: 'x', count: 3 },
      { id: 'tokens', what: 'your Google Calendar sign-in', why: 'x', count: 1 },
      { id: 'pendingCalendarOps', what: 'calendar updates waiting to be sent', why: 'x', count: 5 },
    ])).toBe('This backup does not include your API keys (3), your Google Calendar sign-in and calendar updates waiting to be sent (5). They stay on the device they came from.');
    expect(leftOutLine([])).toBe('');
    expect(leftOutLine(undefined)).toBe('');
  });

  it('lists the single-row records the file carries', () => {
    expect(singletonsReplaced(envelopeWith({}, { settings: {} as never, llmSettings: {} as never }))).toEqual(['settings', 'AI settings']);
    expect(singletonsReplaced(envelopeWith({}))).toEqual([]);
  });
});

describe('tone', () => {
  it('no sentence the person can be shown contains guilt, alarm or urgency', () => {
    const sentences = [
      replaceSentence(previewRows(envelopeWith({ tasks: 3 }), { ...zero(), tasks: 5, conversations: 1 })),
      replaceSentence(previewRows(envelopeWith({ tasks: 0 }), { ...zero(), tasks: 5 })),
      replaceSentence(previewRows(envelopeWith({}), zero())),
      mergeSentence({ collections: [{ key: 'tasks', inFile: 4, added: 1, same: 2, differs: 1 }] }),
      mergeResultSentence({ collections: [{ key: 'tasks', inFile: 4, added: 1, same: 2, differs: 1 }] }),
      leftOutLine([{ id: 'tokens', what: 'your Google Calendar sign-in', why: 'x', count: 1 }]),
    ];
    for (const sentence of sentences) expect(sentence, sentence).not.toMatch(GUILT);
  });
});
