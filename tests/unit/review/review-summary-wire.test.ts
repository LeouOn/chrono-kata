import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewSummary, type ReviewSummaryState } from '@/hooks/useReviewSummary';
import { resetDbForTesting } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import type { Session } from '@/lib/schemas/session';

/**
 * The send path, end to end: the REAL `generateWeeklyReflection` over a stubbed
 * HTTP boundary, compared with the two texts the panel shows. The unit hook test
 * stubs the generation call, so this is the only place that can prove what
 * actually leaves the device.
 */
const NOTE_MARKER = 'PRIVATE-NOTE-MARKER-98765';
const DISPLAY_NAME = 'Ada Lovelace';

const startedAt = new Date('2026-06-16T09:00:00');
const SESSIONS: Session[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    startedAt,
    endedAt: new Date('2026-06-16T09:30:00'),
    durationMinutes: 30,
    reps: null,
    rating: 4,
    activityLabel: 'Trading journal',
    note: `${NOTE_MARKER} - position sizing and a loss I do not want repeated`,
    createdAt: startedAt,
    updatedAt: startedAt,
  } as Session,
];

const originalFetch = global.fetch;
let sentBody: { messages: { role: string; content: string }[] } | null = null;

beforeEach(async () => {
  await resetDbForTesting();
  await llmSettingsRepo.addProvider('openai', {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: 'sk-test',
  });
  await llmSettingsRepo.setActive('openai');
  await settingsRepo.patch({ displayName: DISPLAY_NAME, selectedCoachPersonality: 'zen' });

  sentBody = null;
  global.fetch = vi.fn(async (_url: unknown, init: { body?: unknown } = {}) => {
    sentBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ observations: ['Trading got the week.'], question: 'What would help practice?' }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('the summary wire request', () => {
  it('sends exactly the two texts the panel shows: no note, no name', async () => {
    const { result } = renderHook(() => useReviewSummary());
    await act(async () => {
      await result.current.prepare(SESSIONS);
    });

    const readState = (): ReviewSummaryState => result.current.state;
    const prepared = readState();
    expect(prepared.phase).toBe('privacy');
    if (prepared.phase !== 'privacy') throw new Error('expected the disclosure');

    // The coach and the display name both change after the panel was built. The
    // send must use the values the user was shown, and the name not at all.
    await settingsRepo.patch({ selectedCoachPersonality: 'hype', displayName: 'Someone Else' });

    await act(async () => {
      await result.current.confirm();
    });

    expect(sentBody, 'no request was sent').not.toBeNull();
    expect(sentBody!.messages).toEqual([
      { role: 'system', content: prepared.request.systemPrompt },
      { role: 'user', content: prepared.request.userText },
    ]);

    const wire = JSON.stringify(sentBody);
    expect(wire).not.toContain(NOTE_MARKER);
    expect(wire).not.toContain(DISPLAY_NAME);
    expect(wire).not.toContain('Someone Else');
    expect(wire).not.toContain("The user's name is");
    expect(readState().phase).toBe('done');
  });
});
