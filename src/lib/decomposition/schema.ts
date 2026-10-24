import { z } from 'zod';

/**
 * Wave 3 part 1: the "Break it down" / "This feels heavy" decomposition contract.
 *
 * Pure module: no UI, no DB, no provider imports. The model call is injected
 * (`decompose(mode, input, { complete })`) so tests and later UI wiring can
 * pass any adapter. Parsing reuses the shared fence-stripping JSON helper from
 * `src/lib/llm/clean-response.ts` — the T5 validation style, not a second one.
 */

const MINUTES_MIN = 1;
const FIRST_ACTION_MINUTES_MAX = 25;
const STEP_MINUTES_MAX = 240;
const MAX_STEPS = 7;
const MAX_LIST_ITEMS = 8;
const FIRST_ACTION_MAX_CHARS = 280;
/** Step titles become Task titles on Confirm, and TaskSchema caps titles at 200 —
 * the boundaries must agree so a schema-valid reply can never half-apply. */
export const STEP_TITLE_MAX_CHARS = 200;

const StepSchema = z.object({
  title: z.string().min(1).max(STEP_TITLE_MAX_CHARS),
  minutes: z.number().int().min(MINUTES_MIN).max(STEP_MINUTES_MAX),
});

/**
 * Bounds, and why:
 * - firstActionMinutes: integer 1..25. The roadmap demands an action startable
 *   in 5 minutes; the prompt asks for <= 5. The schema tolerates up to 25 (the
 *   wave cap) so a slightly-off-but-honest model reply validates instead of
 *   burning the single repair round on taste rather than structure.
 * - steps: optional (the user saves them as subtasks only if they choose),
 *   max 7 per the roadmap.
 * - step minutes: integer 1..240 — longer than four hours is not a step, it is
 *   a task that needs its own decomposition; the bound is deliberately loose
 *   to avoid over-rejecting.
 * - needs/pitfalls/canSkipOrDoBadly: required arrays (the prompt always asks
 *   for them), each item a non-empty string, max 8 items. Empty arrays are
 *   allowed so an honest "none" still validates; the prompt requests at least
 *   one item.
 * - firstAction: non-empty, max 280 chars — one actionable line, not a plan.
 */
export const DecompositionSchema = z.object({
  firstAction: z.string().min(1).max(FIRST_ACTION_MAX_CHARS),
  firstActionMinutes: z.number().int().min(MINUTES_MIN).max(FIRST_ACTION_MINUTES_MAX),
  needs: z.array(z.string().min(1)).max(MAX_LIST_ITEMS),
  steps: z.array(StepSchema).max(MAX_STEPS).optional(),
  pitfalls: z.array(z.string().min(1)).max(MAX_LIST_ITEMS),
  canSkipOrDoBadly: z.array(z.string().min(1)).max(MAX_LIST_ITEMS),
});

export type Decomposition = z.infer<typeof DecompositionSchema>;
export type DecompositionStep = z.infer<typeof StepSchema>;

/** The two roadmap modes share one schema; only the prompt focus differs. */
export type DecompositionMode = 'break-it-down' | 'this-feels-heavy';

/** Named routing slot for Wave 5's per-feature provider table (m1's W5 PR). */
export const DECOMPOSITION_FEATURE = 'decomposition' as const;
