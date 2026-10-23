import { z } from 'zod';
import { parseJsonObject } from '@/lib/llm/clean-response';
import { DecompositionSchema, type Decomposition, type DecompositionMode } from './schema';
import {
  buildDecompositionMessages,
  buildRepairMessages,
  type DecompositionMessages,
  type DecompositionTaskInput,
} from './prompt';

/** The model call, injected: `complete(messages) -> raw reply text`. */
export type CompleteFn = (messages: DecompositionMessages) => Promise<string>;

export type DecompositionResult =
  | { kind: 'ok'; value: Decomposition; usedFallback: false; usedRepair: boolean }
  | { kind: 'fallback'; value: string; usedFallback: true; usedRepair: boolean; validationError: string };

/** Deterministic plain-text fallback per mode, flagged so the UI can say it is unstructured. */
export function fallbackDecomposition(mode: DecompositionMode, input: DecompositionTaskInput): string {
  if (mode === 'this-feels-heavy') {
    return `"${input.title}" feels heavy right now. Shrink it: pick the smallest piece you could do badly in five minutes, set a timer, and let the rest wait. Anything you can skip or do badly today, skip or do badly.`;
  }
  return `Start "${input.title}" with one visible, physical first step that takes five minutes or less. Write that step down, set a five-minute timer, and begin. Anything beyond that step can wait until it is done.`;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'reply'} ${issue.message}` : 'validation failed';
}

/**
 * Call → strip fences → Zod parse. On a validation failure, re-prompt ONCE
 * with the validation error; if the retry is still invalid, return a
 * plain-text fallback (flagged). Never throws on bad model output.
 *
 * Provider/network errors are NOT caught: whatever `complete` rejects with
 * (in the app, a typed LLMException) propagates to the caller so the UI can
 * show it.
 */
export async function decompose(
  mode: DecompositionMode,
  input: DecompositionTaskInput,
  deps: { complete: CompleteFn },
): Promise<DecompositionResult> {
  const base = buildDecompositionMessages(mode, input);

  let raw = await deps.complete(base);
  let parsed = DecompositionSchema.safeParse(parseJsonObject(raw));
  if (parsed.success) return { kind: 'ok', value: parsed.data, usedFallback: false, usedRepair: false };

  const firstError = firstIssue(parsed.error);
  raw = await deps.complete(buildRepairMessages(base, raw, firstError));
  parsed = DecompositionSchema.safeParse(parseJsonObject(raw));
  if (parsed.success) return { kind: 'ok', value: parsed.data, usedFallback: false, usedRepair: true };

  return {
    kind: 'fallback',
    value: fallbackDecomposition(mode, input),
    usedFallback: true,
    usedRepair: true,
    validationError: firstIssue(parsed.error),
  };
}
