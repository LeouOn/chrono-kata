import { describe, it, expect, vi } from 'vitest';
import {
  runDecomposition,
  calmErrorCopy,
  type DecompositionCallDeps,
} from '@/lib/decomposition/service';
import { buildDecompositionUserText, buildDecompositionSystemPrompt } from '@/lib/decomposition/prompt';
import { LLMException, LLMExceptionKind } from '@/lib/llm/types';
import { StopReason } from '@/lib/llm/types';
import type { ChatResponse, LLMProvider } from '@/lib/llm/types';

vi.mock('@/lib/db/llm-settings.repo', () => ({
  llmSettingsRepo: {
    get: async () => ({ providers: {}, activeProviderName: 'lmstudio' }),
  },
}));

const VALID = JSON.stringify({
  firstAction: 'Find the spare hose washer in the garage drawer',
  firstActionMinutes: 5,
  needs: ['a wrench'],
  steps: [
    { title: 'Turn off the water valve', minutes: 2 },
    { title: 'Replace the washer', minutes: 10 },
  ],
  pitfalls: ['Starting without turning off the water'],
  canSkipOrDoBadly: ['Cleaning the faucet head'],
});

const INVALID = 'sure, here is a plan, no json at all';

const input = {
  title: 'Fix the dripping hose',
  nextAction: 'check the washer size',
  estimateMinutes: 20,
  project: { title: 'Garden revival', breadcrumb: 'after this: test for leaks' },
};

/** Provider fake replying with the given sequence of raw texts. */
function fakeProvider(replies: string[], calls: { count: number; userTexts: string[] }) {
  const provider: LLMProvider = {
    async completeSingle(req): Promise<ChatResponse> {
      calls.count += 1;
      calls.userTexts.push(req.userText);
      const reply = replies[Math.min(calls.count - 1, replies.length - 1)];
      if (reply === '__TIMEOUT__') {
        throw new LLMException('timed out', LLMExceptionKind.Timeout);
      }
      if (reply === '__429__') {
        throw new LLMException('rate limited', LLMExceptionKind.RateLimited);
      }
      if (reply === '__EMPTY__') return { content: null, stopReason: StopReason.EndTurn };
      return { content: reply ?? null, stopReason: StopReason.EndTurn };
    },
  };
  return provider;
}

const deps = (provider: LLMProvider): DecompositionCallDeps => ({
  resolve: async () => ({
    providerName: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
    model: 'qwen2.5-7b',
    credentialSource: 'browser' as const,
  }),
  factory: () => provider,
});

describe('runDecomposition', () => {
  it('returns a valid decomposition and the exact wire text', async () => {
    const calls = { count: 0, userTexts: [] as string[] };
    const out = await runDecomposition('break-it-down', input, {}, deps(fakeProvider([VALID], calls)));
    expect(out.result.kind).toBe('ok');
    if (out.result.kind !== 'ok') throw new Error('unreachable');
    expect(out.result.usedRepair).toBe(false);
    expect(out.result.value.firstActionMinutes).toBe(5);
    expect(out.providerName).toBe('lmstudio');
    expect(out.model).toBe('qwen2.5-7b');
    expect(out.local).toBe(true);

    // The wire text is exactly what the prompt builders produce — one source.
    expect(out.wire.user).toBe(buildDecompositionUserText(input));
    expect(out.wire.system).toBe(buildDecompositionSystemPrompt('break-it-down'));
    // And the model received exactly that user text on the first call.
    expect(calls.userTexts[0]).toBe(out.wire.user);
  });

  it('sends only the allowed fields — a note cannot leak (snapshot)', () => {
    const text = buildDecompositionUserText(input);
    expect(text).toContain('- title: Fix the dripping hose');
    expect(text).toContain('- next action already noted: check the washer size');
    expect(text).toContain('- current estimate: 20 minutes');
    expect(text).toContain('- project: Garden revival');
    expect(text).toContain('- project path: after this: test for leaks');
    // The input type carries no note/session/health fields; snapshot the
    // whole text so ANY new field added to the builder fails this test.
    expect(text).toMatchInlineSnapshot(`
      "Task to decompose:
      - title: Fix the dripping hose
      - next action already noted: check the washer size
      - current estimate: 20 minutes
      - project: Garden revival
      - project path: after this: test for leaks

      Decompose this task. JSON only."
    `);
  });

  it('repairs once on invalid JSON and succeeds', async () => {
    const calls = { count: 0, userTexts: [] as string[] };
    const out = await runDecomposition(
      'this-feels-heavy',
      { title: 'Taxes' },
      {},
      deps(fakeProvider([INVALID, VALID], calls)),
    );
    expect(out.result.kind).toBe('ok');
    if (out.result.kind !== 'ok') throw new Error('unreachable');
    expect(out.result.usedRepair).toBe(true);
    expect(calls.count).toBe(2);
    // The repair round includes the failed reply and the validation error.
    expect(calls.userTexts[1]).toContain('Your previous reply:');
    expect(calls.userTexts[1]).toContain('not valid');
  });

  it('falls back to flagged plain text after two invalid replies', async () => {
    const out = await runDecomposition(
      'break-it-down',
      { title: 'Taxes' },
      {},
      deps(fakeProvider([INVALID, INVALID], { count: 0, userTexts: [] })),
    );
    expect(out.result.kind).toBe('fallback');
    if (out.result.kind !== 'fallback') throw new Error('unreachable');
    expect(out.result.usedFallback).toBe(true);
    expect(out.result.validationError).toBeTruthy();
    // The fallback never contains structure to save.
    expect(out.result.value).not.toContain('{');
  });

  it('treats an empty reply as invalid and falls back after one repair', async () => {
    const out = await runDecomposition(
      'break-it-down',
      { title: 'Taxes' },
      {},
      deps(fakeProvider(['__EMPTY__', '__EMPTY__'], { count: 0, userTexts: [] })),
    );
    expect(out.result.kind).toBe('fallback');
  });

  it('propagates provider errors so nothing is written on a failed call', async () => {
    for (const [label, reply, kind] of [
      ['timeout', '__TIMEOUT__', LLMExceptionKind.Timeout],
      ['rate limit', '__429__', LLMExceptionKind.RateLimited],
    ] as const) {
      try {
        await runDecomposition(
          'break-it-down',
          { title: 'Taxes' },
          {},
          deps(fakeProvider([reply], { count: 0, userTexts: [] })),
        );
        throw new Error(`${label} should have thrown`);
      } catch (e) {
        expect((e as LLMException).kind).toBe(kind);
      }
    }
  });

  it('private mode refusing a remote provider surfaces the calm message', async () => {
    const privacyBlocked = new LLMException(
      'Private mode is on, so nothing may be sent to cloudx (https://api.cloudx.com). Configure a local provider (LM Studio or Ollama) or turn private mode off in Settings.',
      LLMExceptionKind.PrivacyBlocked,
    );
    try {
      await runDecomposition('break-it-down', { title: 'Taxes' }, {}, {
        resolve: async () => {
          throw privacyBlocked;
        },
        factory: () => fakeProvider([VALID], { count: 0, userTexts: [] }),
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as LLMException).kind).toBe('privacyBlocked');
      expect(calmErrorCopy(e, 'x')).toBe(privacyBlocked.message);
    }
  });
});

describe('calmErrorCopy', () => {
  it('maps every kind to calm copy with no forbidden wording', () => {
    const forbidden = /\b(failed|failure|overdue|late|behind|missed)\b/i;
    const cases: Array<[unknown, string]> = [
      [new LLMException('x', LLMExceptionKind.Timeout), 'The provider did not answer in time. You can try again.'],
      [new LLMException('x', LLMExceptionKind.RateLimited), 'The provider is busy right now (rate limit). A moment, then try again.'],
      [new LLMException('x', LLMExceptionKind.Offline), 'You appear to be offline. The task keeps; try again when connected.'],
      [new LLMException('x', LLMExceptionKind.AuthFailed), 'The provider did not accept the key. Check it in LLM settings.'],
      [new LLMException('x', LLMExceptionKind.Provider), 'The provider could not be reached. Check the provider in LLM settings, then try again.'],
      [new LLMException('boom', LLMExceptionKind.Unknown), 'Something came up before anything was sent or saved. You can try again.'],
      [Object.assign(new Error('nope'), { name: 'TimeoutError' }), 'The provider did not answer in time. You can try again.'],
    ];
    for (const [error, expected] of cases) {
      const copy = calmErrorCopy(error, 'The provider');
      expect(copy).toBe(expected);
      expect(copy).not.toMatch(forbidden);
    }
  });
});
