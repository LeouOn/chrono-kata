import { describe, expect, it } from 'vitest';
import { COACH_PROMPTS, PACING_CLAUSE, getCoachSystemPrompt } from '@/lib/coaches';

describe('pacing clause', () => {
  it('is appended to every coach, including hype', () => {
    for (const name of Object.keys(COACH_PROMPTS)) {
      const prompt = getCoachSystemPrompt(name as keyof typeof COACH_PROMPTS);
      expect(prompt).toContain(PACING_CLAUSE);
    }
    expect(getCoachSystemPrompt('hype')).toContain('Never encourage pushing through low energy');
  });
});
