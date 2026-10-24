import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewSummary, type ReviewSummaryState } from '@/hooks/useReviewSummary';
import { resetDbForTesting } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import type { Session } from '@/lib/schemas/session';

const generate = vi.fn();
vi.mock('@/lib/llm/llm-service', () => ({
  generateWeeklyReflection: (...args: unknown[]) => generate(...args),
}));

function session(patch: Partial<Session> & { id: string }): Session {
  const startedAt = new Date('2026-06-16T09:00:00');
  return {
    rating: 4,
    durationMinutes: 30,
    reps: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
    ...patch,
  } as Session;
}

const SESSIONS = [
  session({
    id: '11111111-1111-4111-8111-111111111111',
    activityLabel: 'Trading journal',
    note: 'private note that must not be sent',
  }),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
  await llmSettingsRepo.addProvider('local', { baseUrl: 'http://127.0.0.1:1234', model: 'm', apiKey: '' });
});

describe('useReviewSummary', () => {
  it('prepares a preview without notes and sends nothing until confirm', async () => {
    const { result } = renderHook(() => useReviewSummary());

    await act(async () => {
      await result.current.prepare(SESSIONS);
    });
    expect(result.current.state.phase).toBe('privacy');
    if (result.current.state.phase !== 'privacy') throw new Error('expected privacy');
    expect(result.current.state.request.userText).not.toContain('private note');
    expect(generate).not.toHaveBeenCalled();

    generate.mockResolvedValue({
      observations: ['Trading got attention.', 'Practice stalled once.'],
      question: 'What would make practice easy to start?',
      promptTokens: 10,
      completionTokens: 5,
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0]![0] as { sessions: Session[]; personality: string };
    // It sends the scrubbed rows, exactly the ones the preview was built from.
    expect(call.sessions[0]?.note).toBeUndefined();
    expect(call.personality).toBe('zen');
    // Read through a function: TypeScript's earlier narrowing of
    // `result.current.state` would otherwise survive the await.
    const readState = (): ReviewSummaryState => result.current.state;
    const done = readState();
    expect(done.phase).toBe('done');
    if (done.phase !== 'done') throw new Error('expected done');
    expect(done.summary.observations).toHaveLength(2);
  });

  it('two confirms in one act() send one request', async () => {
    const { result } = renderHook(() => useReviewSummary());
    await act(async () => {
      await result.current.prepare(SESSIONS);
    });
    generate.mockResolvedValue({ observations: [], question: '', promptTokens: 1, completionTokens: 1 });

    await act(async () => {
      const first = result.current.confirm();
      const second = result.current.confirm();
      await Promise.all([first, second]);
    });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('a failed send returns to the disclosure with the error and can be retried', async () => {
    const { result } = renderHook(() => useReviewSummary());
    await act(async () => {
      await result.current.prepare(SESSIONS);
    });
    generate.mockRejectedValueOnce(new Error('private mode is on'));

    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.state.phase).toBe('error');

    generate.mockResolvedValueOnce({ observations: ['ok'], question: '', promptTokens: 1, completionTokens: 1 });
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.state.phase).toBe('done');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('closing an in-flight call aborts it and leaves no result or error behind', async () => {
    const { result } = renderHook(() => useReviewSummary());
    await act(async () => {
      await result.current.prepare(SESSIONS);
    });

    let signal: AbortSignal | undefined;
    let settle: ((outcome: 'resolve' | 'reject') => void) | null = null;
    generate.mockImplementationOnce(
      (input: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          signal = input.signal;
          settle = (outcome) =>
            outcome === 'resolve'
              ? resolve({ observations: ['late'], question: '', promptTokens: 1, completionTokens: 1 })
              : reject(new Error('aborted'));
        }),
    );

    act(() => {
      void result.current.confirm();
    });
    await waitFor(() => expect(signal).toBeDefined());

    // Closing must abort the request, not merely hide the panel.
    act(() => result.current.close());
    expect(signal!.aborted).toBe(true);

    // The provider rejects because of the abort: the hook must stay idle, so no
    // error panel appears and no late result lands behind the user's back.
    await act(async () => {
      settle!('reject');
      await Promise.resolve();
    });
    expect(result.current.state.phase).toBe('idle');
  });

  it('closing aborts an in-flight request and shows no error', async () => {
    const { result } = renderHook(() => useReviewSummary());
    await act(async () => {
      await result.current.prepare(SESSIONS);
    });
    let rejectWith: (error: unknown) => void = () => {};
    generate.mockImplementationOnce(
      (input: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectWith = reject;
          input.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    act(() => {
      void result.current.confirm();
    });
    act(() => result.current.close());
    await act(async () => {
      rejectWith(new Error('aborted'));
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('idle');
  });
});
