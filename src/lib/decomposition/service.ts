import { decompose, type DecompositionResult } from './decompose';
import {
  buildDecompositionMessages,
  type DecompositionTaskInput,
} from './prompt';
import { DECOMPOSITION_FEATURE, type DecompositionMode } from './schema';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { createLLMProvider } from '@/lib/llm/provider-factory';
import { resolveProviderFor, withTimeout } from '@/lib/llm/llm-service';
import { isLocalProvider } from '@/lib/llm/local-provider';
import type { LLMProvider } from '@/lib/llm/types';

/**
 * Wave 3 part 2: the wired "Break it down" call.
 *
 * Everything the model is allowed to see is built by `buildDecompositionMessages`
 * (title, next action, estimate, project name — nothing else). The exact wire
 * text is returned so the sheet can show it BEFORE the first call of a session.
 * A call that errors writes nothing: there is no write on this path at all.
 */

export interface DecompositionWire {
  system: string;
  user: string;
}

export interface DecompositionCallResult {
  result: DecompositionResult;
  providerName: string;
  model: string;
  /** True when the routed provider is local (LM Studio / Ollama host). */
  local: boolean;
  wire: DecompositionWire;
}

export interface DecompositionCallDeps {
  /** Resolves the routed provider for the decomposition feature. */
  resolve?: typeof resolveProviderFor;
  factory?: (config: Parameters<typeof createLLMProvider>[0]) => LLMProvider;
}

/** Flatten the message history into the single-turn adapter shape. */
function flattenMessages(
  messages: ReturnType<typeof buildDecompositionMessages>,
): { system: string; user: string } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'assistant' ? `Your previous reply:\n${m.content}` : m.content))
    .join('\n\n---\n\n');
  return { system, user: rest };
}

export async function runDecomposition(
  mode: DecompositionMode,
  input: DecompositionTaskInput,
  options: { signal?: AbortSignal } = {},
  deps: DecompositionCallDeps = {},
): Promise<DecompositionCallResult> {
  const resolve = deps.resolve ?? resolveProviderFor;
  const factory = deps.factory ?? createLLMProvider;

  const settings = await llmSettingsRepo.get();
  const config = await resolve(settings, undefined, DECOMPOSITION_FEATURE);
  const provider = factory(config);
  const wire = flattenMessages(buildDecompositionMessages(mode, input));

  const result = await decompose(mode, input, {
    complete: async (messages) => {
      const flat = flattenMessages(messages);
      const response = await provider.completeSingle({
        systemPrompt: flat.system,
        userText: flat.user,
        signal: withTimeout(options.signal),
      });
      return response.content ?? '';
    },
  });

  return {
    result,
    providerName: config.providerName,
    model: config.model,
    local: isLocalProvider(config),
    wire,
  };
}

/**
 * Calm, human copy per error kind — no stack traces, no "failed" language.
 * Used by the sheet; kept here so tests cover the mapping next to the call.
 */
export function calmErrorCopy(error: unknown, providerName: string): string {
  const kind = (error as { kind?: string })?.kind;
  const name = error instanceof Error ? error.name : '';
  if (kind === 'timeout' || name === 'TimeoutError') {
    return `${providerName} did not answer in time. You can try again.`;
  }
  switch (kind) {
    case 'privacyBlocked':
      return error instanceof Error
        ? error.message
        : 'Private mode is on, so nothing may leave this device.';
    case 'offline':
      return 'You appear to be offline. The task keeps; try again when connected.';
    case 'rateLimited':
      return `${providerName} is busy right now (rate limit). A moment, then try again.`;
    case 'authFailed':
      return `${providerName} did not accept the key. Check it in LLM settings.`;
    case 'provider':
      return `${providerName} could not be reached. Check the provider in LLM settings, then try again.`;
    default:
      return 'Nothing was saved. You can try again.';
  }
}
