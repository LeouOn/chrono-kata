import { z } from 'zod';
import type { RecommendAction, Recommendation } from '@/lib/pacing/types';

const CoachBriefingSchema = z.object({
  summary: z.string().min(1),
  suggestion: z.string().min(1),
  tone: z.enum(['gentle', 'steady', 'encouraging']),
});

export interface CoachBriefing {
  summary: string;
  suggestion: string;
  tone: 'gentle' | 'steady' | 'encouraging';
  usedFallback: boolean;
}

const CONTRADICTION = /\b(push|more than yesterday|challenge yourself)\b/i;

export function fallbackBriefing(recommendation: Pick<Recommendation, 'action' | 'reasons'>): Omit<CoachBriefing, 'usedFallback'> {
  const summary = recommendation.reasons.join(' ') || `Today is a ${recommendation.action} day.`;
  const tone = recommendation.action === 'rest' || recommendation.action === 'reduce' ? 'gentle' : 'steady';
  return { summary, suggestion: summary, tone };
}

function contradicts(action: RecommendAction, suggestion: string): boolean {
  return (action === 'rest' || action === 'reduce') && CONTRADICTION.test(suggestion);
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseCoachBriefing(
  raw: string,
  recommendation: Pick<Recommendation, 'action' | 'reasons'>,
): CoachBriefing {
  const fallback = { ...fallbackBriefing(recommendation), usedFallback: true as const };
  const parsed = CoachBriefingSchema.safeParse(parseJsonObject(cleanLLMResponse(raw)));
  if (!parsed.success || contradicts(recommendation.action, parsed.data.suggestion)) return fallback;
  return { ...parsed.data, usedFallback: false };
}

/**
 * Strip <think>...</think> reasoning blocks that some models (minimax,
 * DeepSeek-R1, GLM with thinking enabled) embed inline in the content
 * field rather than in a separate reasoning_content field.
 *
 * Also strips wrapping quotes and trims whitespace.
 */
export function cleanLLMResponse(text: string): string {
  let cleaned = text;
  // Remove <think>...</think> blocks (non-greedy, multiline).
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove orphaned opening <think> without closing tag (streaming partial).
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  // Remove orphaned closing </think> without opening (streaming partial).
  cleaned = cleaned.replace(/<\/think>/gi, '');
  // Strip wrapping quotes.
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '');
  return cleaned.trim();
}

/**
 * Streaming-safe filter: given accumulated text so far, return only the
 * "visible" portion (everything outside <think> blocks). Handles partial
 * tags by checking if we're currently inside an unclosed <think>.
 */
export function filterStreamingText(accumulated: string): string {
  // If there's an unclosed <think>, everything after it is hidden.
  const lastOpen = accumulated.lastIndexOf('<think>');
  const lastClose = accumulated.lastIndexOf('</think>');
  if (lastOpen > lastClose) {
    // We're inside a think block — show everything before <think>.
    return cleanLLMResponse(accumulated.slice(0, lastOpen));
  }
  // No unclosed think block — clean normally.
  return cleanLLMResponse(accumulated);
}