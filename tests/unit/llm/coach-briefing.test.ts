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
});
