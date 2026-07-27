import type { Session } from '@/lib/schemas/session';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';
import { getCoachSystemPrompt } from '@/lib/coaches';
import { createLLMProvider } from './provider-factory';
import { buildCoachUserText, buildWeeklyReflectionUserText } from './prompt-builders';
import { LLMException, LLMExceptionKind } from './types';
import type { StreamChunk, StreamingLLMProvider } from './types';
import type { ProviderConfig } from './provider-config';
import { cleanLLMResponse, filterStreamingText } from './clean-response';

const LLM_TIMEOUT_MS = 30_000;

function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const defined = signals.filter((s): s is AbortSignal => s != null);
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0]!;
  // AbortSignal.any is supported in modern browsers and Node 20+.
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(defined);
  }
  // Fallback: create a controller that aborts when any input aborts.
  const controller = new AbortController();
  for (const s of defined) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function withTimeout(signal?: AbortSignal): AbortSignal | undefined {
  const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
  return combineSignals([signal, timeoutSignal]);
}

export interface CoachCommentInput {
  currentSession: Session;
  recentSessions: Session[];
  personality: CoachPersonality;
  displayName?: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export interface GenerateCoachCommentResult {
  comment: string;
  promptTokens: number;
  completionTokens: number;
  personalityUsed: CoachPersonality;
}

/**
 * Generate the coach comment for a freshly-saved session.
 * Throws LLMException on any failure. Caller handles failedLLM flag.
 */
export async function generateCoachComment(
  input: CoachCommentInput
): Promise<GenerateCoachCommentResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException(
      'Offline — coach skipped.',
      LLMExceptionKind.Offline,
    );
  }

  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt = personalizeSystemPrompt(
    getCoachSystemPrompt(input.personality),
    input.displayName,
  );

  const response = await provider.completeSingle({
    userText: buildCoachUserText(input.currentSession, input.recentSessions),
    systemPrompt,
    signal: withTimeout(input.signal),
  });

  if (!response.content) {
    throw new LLMException('Provider returned empty response.');
  }

  return {
    comment: cleanLLMResponse(response.content),
    promptTokens: response.usage?.promptTokens ?? 0,
    completionTokens: response.usage?.completionTokens ?? 0,
    personalityUsed: input.personality,
  };
}

export interface GenerateCoachCommentStreamInput extends CoachCommentInput {
  onToken: (token: string) => void;
}

export async function generateCoachCommentStream(
  input: GenerateCoachCommentStreamInput,
): Promise<GenerateCoachCommentResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline — coach skipped.', LLMExceptionKind.Offline);
  }

  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);

  if ('streamCompleteSingle' in provider && typeof (provider as StreamingLLMProvider).streamCompleteSingle === 'function') {
    const streamingProvider = provider as StreamingLLMProvider;
    const systemPrompt = personalizeSystemPrompt(
      getCoachSystemPrompt(input.personality),
      input.displayName,
    );

    let fullText = '';
    const usage = await streamingProvider.streamCompleteSingle({
      userText: buildCoachUserText(input.currentSession, input.recentSessions),
      systemPrompt,
      signal: withTimeout(input.signal),
      onChunk: (chunk: StreamChunk) => {
        if (chunk.content) {
          fullText += chunk.content;
          input.onToken(filterStreamingText(fullText));
        }
      },
    });

    const cleaned = cleanLLMResponse(fullText);
    if (!cleaned) {
      throw new LLMException('Provider returned empty streaming response.');
    }

    return {
      comment: cleaned,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      personalityUsed: input.personality,
    };
  }

  const result = await generateCoachComment(input);
  input.onToken(result.comment);
  return result;
}

export interface WeeklyReflectionInput {
  sessions: Session[];
  personality: CoachPersonality;
  displayName?: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export interface WeeklyReflectionResult {
  observations: string[];
  question: string;
  promptTokens: number;
  completionTokens: number;
}

export async function generateWeeklyReflection(
  input: WeeklyReflectionInput,
): Promise<WeeklyReflectionResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline — cannot generate reflection.', LLMExceptionKind.Offline);
  }
  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt = personalizeSystemPrompt(
    getCoachSystemPrompt(input.personality),
    input.displayName,
  );

  const response = await provider.completeSingle({
    userText: buildWeeklyReflectionUserText(input.sessions),
    systemPrompt,
    signal: withTimeout(input.signal),
  });

  if (!response.content) {
    throw new LLMException('Provider returned empty response.');
  }

  // Parse JSON response. Tolerate surrounding text.
  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new LLMException('Reflection response was not valid JSON.');
  }
  try {
    const parsed = JSON.parse(jsonMatch[0] as string) as { observations?: string[]; question?: string };
    if (!Array.isArray(parsed.observations) || typeof parsed.question !== 'string') {
      throw new LLMException('Reflection JSON missing required fields.');
    }
    return {
      observations: parsed.observations.slice(0, 5),
      question: parsed.question,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
    };
  } catch (e) {
    if (e instanceof LLMException) throw e;
    throw new LLMException(`Failed to parse reflection JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface LabelSuggestionInput {
  note: string;
  llmSettings: LLMSettings;
  signal?: AbortSignal;
}

export async function suggestLabel(input: LabelSuggestionInput): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LLMException('Offline.', LLMExceptionKind.Offline);
  }
  const config = resolveActiveProvider(input.llmSettings);
  const provider = createLLMProvider(config);
  const systemPrompt =
    'You suggest short activity labels (1-3 words) for a practice session based on the user\'s note. ' +
    'Reply with ONLY the label, no quotes, no punctuation, no explanation. ' +
    'Examples: "meditation", "trading review", "deep work", "push-ups", "reading".';

  const response = await provider.completeSingle({
    userText: `Note: "${input.note.slice(0, 500)}"\n\nSuggest a label:`,
    systemPrompt,
    signal: withTimeout(input.signal),
  });

  if (!response.content) throw new LLMException('Empty label response.');
  // Strip to single line, trim quotes/punctuation.
  return response.content.split('\n')[0]!.trim().replace(/^["'#-]+|["'.]+$/g, '').slice(0, 50);
}

function resolveActiveProvider(settings: LLMSettings): ProviderConfig {
  const name = settings.activeProviderName;
  const entry = settings.providers[name];
  if (!entry) {
    throw new LLMException(
      `No provider configured with name "${name}". Add it in LLM settings.`,
      LLMExceptionKind.AuthFailed,
    );
  }
  return {
    providerName: name,
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
    model: entry.model,
  };
}

function personalizeSystemPrompt(prompt: string, displayName?: string): string {
  if (!displayName) return prompt;
  return `${prompt}\n\nThe user's name is ${displayName}.`;
}
