import { describe, expect, it, vi } from 'vitest';
import { decompose } from '@/lib/decomposition/decompose';
import type { CompleteFn } from '@/lib/decomposition/decompose';
import type { DecompositionMessages } from '@/lib/decomposition/prompt';

const task = { title: 'Prepare tax documents' };

const validReply = JSON.stringify({
  firstAction: 'Open the folder labeled Tax 2025 and take out the envelope on top',
  firstActionMinutes: 3,
  needs: ['the envelope', 'a pen'],
  steps: [{ title: 'Gather documents', minutes: 20 }],
  pitfalls: ['Trying to finish everything in one sitting'],
  canSkipOrDoBadly: ['Perfect sorting — a rough pile is enough'],
});

/** complete fn that replies in order, once per call. */
function repliesWith(...replies: string[]): CompleteFn & { calls: DecompositionMessages[] } {
  const calls: DecompositionMessages[] = [];
  let n = 0;
  const fn = vi.fn(async (messages: DecompositionMessages) => {
    calls.push(messages);
    const reply = replies[Math.min(n, replies.length - 1)];
    n += 1;
    return reply;
  });
  return Object.assign(fn as unknown as CompleteFn & { calls: DecompositionMessages[] }, { calls });
}

describe('decompose', () => {
  it('accepts valid JSON on the first call without repair', async () => {
    const complete = repliesWith(validReply);
    const result = await decompose('break-it-down', task, { complete });
    expect(result).toMatchObject({ kind: 'ok', usedFallback: false, usedRepair: false });
    if (result.kind === 'ok') expect(result.value.firstActionMinutes).toBe(3);
    expect(complete.calls).toHaveLength(1);
  });

  it('accepts fenced JSON', async () => {
    const complete = repliesWith('```json\n' + validReply + '\n```');
    const result = await decompose('break-it-down', task, { complete });
    expect(result.kind).toBe('ok');
  });

  it('accepts prose-wrapped JSON', async () => {
    const complete = repliesWith('Sure! Here is the decomposition:\n' + validReply + '\nHope that helps.');
    const result = await decompose('break-it-down', task, { complete });
    expect(result.kind).toBe('ok');
  });

  it('repairs once when fields are missing, and the repair prompt carries the error and the failed reply', async () => {
    const missingFields = JSON.stringify({ firstAction: 'Open the folder', needs: [], pitfalls: [], canSkipOrDoBadly: [] });
    const complete = repliesWith(missingFields, validReply);
    const result = await decompose('break-it-down', task, { complete });
    expect(result).toMatchObject({ kind: 'ok', usedRepair: true });
    expect(complete.calls).toHaveLength(2);
    const repair = complete.calls[1]!;
    expect(repair[2]).toMatchObject({ role: 'assistant', content: missingFields });
    expect(repair[3]!.content).toMatch(/firstActionMinutes/i);
  });

  it('repairs when steps exceed 7', async () => {
    const tooManySteps = JSON.stringify({
      firstAction: 'Open the folder',
      firstActionMinutes: 3,
      needs: [],
      steps: Array.from({ length: 8 }, (_, i) => ({ title: `Step ${i + 1}`, minutes: 5 })),
      pitfalls: ['x'],
      canSkipOrDoBadly: ['y'],
    });
    const complete = repliesWith(tooManySteps, validReply);
    const result = await decompose('break-it-down', task, { complete });
    expect(result).toMatchObject({ kind: 'ok', usedRepair: true });
  });

  it('repairs wrong types (string minutes)', async () => {
    const wrongTypes = validReply.replace('"firstActionMinutes":3', '"firstActionMinutes":"five"');
    const complete = repliesWith(wrongTypes, validReply);
    const result = await decompose('break-it-down', task, { complete });
    expect(result).toMatchObject({ kind: 'ok', usedRepair: true });
  });

  it('falls back to flagged plain text when the repair also fails', async () => {
    const complete = repliesWith('I cannot help with that.');
    const result = await decompose('break-it-down', task, { complete });
    expect(result).toMatchObject({ kind: 'fallback', usedFallback: true, usedRepair: true });
    if (result.kind === 'fallback') {
      expect(result.value).toContain('Prepare tax documents');
      expect(result.value).not.toContain('{');
    }
    expect(complete.calls).toHaveLength(2);
  });

  it('falls back on an empty reply', async () => {
    const complete = repliesWith('');
    const result = await decompose('break-it-down', task, { complete });
    expect(result.kind).toBe('fallback');
  });

  it('never makes a third call', async () => {
    const complete = repliesWith('garbage', 'more garbage');
    await decompose('break-it-down', task, { complete });
    expect(complete.calls).toHaveLength(2);
  });

  it('propagates provider errors instead of swallowing them', async () => {
    const providerError = Object.assign(new Error('LLMException[auth]: key rejected'), { kind: 'AuthFailed' });
    const complete = vi.fn(async () => { throw providerError; });
    await expect(decompose('break-it-down', task, { complete })).rejects.toBe(providerError);
  });

  it('heavy-mode fallback text shrinks scope rather than planning', async () => {
    const complete = repliesWith('nope');
    const result = await decompose('this-feels-heavy', { title: 'Rewrite the whole garden plan' }, { complete });
    if (result.kind !== 'fallback') throw new Error('expected fallback');
    expect(result.value).toMatch(/smallest piece you could do badly in five minutes/i);
  });
});
