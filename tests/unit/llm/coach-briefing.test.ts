import { describe, expect, it } from 'vitest';
import { parseCoachBriefing } from '@/lib/llm/clean-response';

const rest = { action: 'rest' as const, reasons: ['Low energy this morning.'] };

describe('parseCoachBriefing', () => {
  it('accepts valid JSON', () => {
    const parsed = parseCoachBriefing(
      '{"summary":"Low energy.","suggestion":"Keep today easy.","tone":"gentle"}',
      rest,
    );
    expect(parsed.usedFallback).toBe(false);
    expect(parsed.suggestion).toBe('Keep today easy.');
  });

  it('accepts fenced JSON', () => {
    const parsed = parseCoachBriefing(
      '```json\n{"summary":"Low energy.","suggestion":"Keep today easy.","tone":"steady"}\n```',
      rest,
    );
    expect(parsed.usedFallback).toBe(false);
  });

  it('checks the summary for contradictions, not only the suggestion', () => {
    const parsed = parseCoachBriefing(
      '{"summary":"Go hard and push through the fatigue.","suggestion":"Keep today easy.","tone":"gentle"}',
      rest,
    );
    expect(parsed.usedFallback).toBe(true);
  });

  it.each([
    ['Push yourself today', true],
    ['Pushing harder is fine', true],
    ['You pushed through it last time', true],
    ['A few push-ups count as practice', true],
    ['Do more than yesterday', true],
    ['Challenge yourself with a long walk', true],
    ['Keep today easy', false],
    ['A gentle walk if it feels good', false],
    ['Steady, same as yesterday', false],
  ])('suggestion %s falls back=%s', (suggestion, shouldFallback) => {
    const raw = JSON.stringify({ summary: 'Low energy.', suggestion, tone: 'gentle' });
    expect(parseCoachBriefing(raw, rest).usedFallback).toBe(shouldFallback);
  });

  it('falls back for prose, contradictions, and empty text', () => {
    expect(parseCoachBriefing('Just go for a long walk.', rest).usedFallback).toBe(true);
    expect(parseCoachBriefing(
      '{"summary":"Go.","suggestion":"Push harder and challenge yourself.","tone":"encouraging"}',
      rest,
    ).usedFallback).toBe(true);
    expect(parseCoachBriefing('', rest)).toMatchObject({
      usedFallback: true,
      summary: 'Low energy this morning.',
    });
  });

  it('fallback suggestion is distinct, so the summary never renders twice', () => {
    const fallback = parseCoachBriefing('', rest);
    expect(fallback.usedFallback).toBe(true);
    expect(fallback.suggestion).not.toBe(fallback.summary);
    expect(fallback.suggestion).toContain('Today is for rest.');
    const rendered = `${fallback.summary} ${fallback.suggestion}`;
    expect(rendered.indexOf('Low energy this morning.')).toBe(rendered.lastIndexOf('Low energy this morning.'));
  });
});
