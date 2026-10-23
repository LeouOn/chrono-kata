import type { DecompositionMode } from './schema';

/**
 * What the model is allowed to see: the single task being decomposed and,
 * optionally, its project context. Nothing else — no session notes, no
 * check-in/pacing data, no journal text (lead decision Q2: every new AI
 * surface shows exactly what leaves the device, so the wire text is built
 * here, in one function, for the later "What gets sent" panel).
 */
export interface DecompositionTaskInput {
  title: string;
  nextAction?: string;
  estimateMinutes?: number;
  project?: { title: string; breadcrumb?: string };
}

export interface DecompositionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type DecompositionMessages = DecompositionMessage[];

const SCHEMA_TEXT =
  '{ "firstAction": string, "firstActionMinutes": number (1-25), "needs": string[], ' +
  '"steps"?: { "title": string, "minutes": number }[] (max 7), "pitfalls": string[], ' +
  '"canSkipOrDoBadly": string[] }';

const SHARED_RULES = [
  'Rules:',
  '- firstAction is ONE physical action that can be started within 5 minutes. Not a goal, not a category — a concrete first move.',
  '- steps: at most 7, each with its own minutes. They are optional; omit them when the task is simple.',
  '- Always include at least one pitfall (how this tends to go wrong) and at least one item in canSkipOrDoBadly (what can be skipped or done badly without breaking the task).',
  `- Reply with JSON only, no prose, no code fences, matching exactly: ${SCHEMA_TEXT}`,
].join('\n');

const MODE_FOCUS: Record<DecompositionMode, string> = {
  'break-it-down':
    'Break this task down into a startable first move and, if useful, a short path of steps.',
  'this-feels-heavy':
    'This task feels heavy to the user. Shrink the scope: the first action must be deliberately tiny, the steps should cut, defer, or lower the bar rather than add work, and the pitfalls should name all-or-nothing thinking and perfectionism. Prefer doing a small part badly over doing nothing.',
};

export function buildDecompositionSystemPrompt(mode: DecompositionMode): string {
  return [MODE_FOCUS[mode], '', SHARED_RULES].join('\n');
}

/**
 * The exact user-side wire text for one decomposition call. This is what a
 * future "What gets sent" panel renders (the T5c pattern) — keep it a pure
 * function of the allowed input fields.
 */
export function buildDecompositionUserText(input: DecompositionTaskInput): string {
  const lines: string[] = ['Task to decompose:', `- title: ${input.title}`];
  if (input.nextAction) lines.push(`- next action already noted: ${input.nextAction}`);
  if (input.estimateMinutes != null) lines.push(`- current estimate: ${input.estimateMinutes} minutes`);
  if (input.project) {
    lines.push(`- project: ${input.project.title}`);
    if (input.project.breadcrumb) lines.push(`- project path: ${input.project.breadcrumb}`);
  }
  lines.push('', 'Decompose this task. JSON only.');
  return lines.join('\n');
}

export function buildDecompositionMessages(
  mode: DecompositionMode,
  input: DecompositionTaskInput,
): DecompositionMessages {
  return [
    { role: 'system', content: buildDecompositionSystemPrompt(mode) },
    { role: 'user', content: buildDecompositionUserText(input) },
  ];
}

/**
 * The single repair re-prompt (used once, after a validation failure):
 * same conversation plus the failed reply and the validation error.
 */
export function buildRepairMessages(
  base: DecompositionMessages,
  failedReply: string,
  validationError: string,
): DecompositionMessages {
  return [
    ...base,
    { role: 'assistant', content: failedReply },
    {
      role: 'user',
      content: `That reply was not valid: ${validationError}\nReply again with JSON only, matching the schema. Every array item is a non-empty string; firstActionMinutes and each step minutes are integers.`,
    },
  ];
}
