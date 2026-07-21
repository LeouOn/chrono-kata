import { ATHENA_SYSTEM_PROMPT } from './athena-persona';
import { BUDDY_SYSTEM_PROMPT } from './buddy';
import { ANALYST_SYSTEM_PROMPT } from './analyst';
import { HYPE_SYSTEM_PROMPT } from './hype';
import { ZEN_SYSTEM_PROMPT } from './zen';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

export const COACH_PROMPTS: Record<CoachPersonality, string> = {
  zen: ZEN_SYSTEM_PROMPT,
  hype: HYPE_SYSTEM_PROMPT,
  analyst: ANALYST_SYSTEM_PROMPT,
  buddy: BUDDY_SYSTEM_PROMPT,
  athena: ATHENA_SYSTEM_PROMPT,
};

export function getCoachSystemPrompt(name: CoachPersonality): string {
  return COACH_PROMPTS[name];
}

export * from './athena-persona';
