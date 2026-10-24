import { z } from 'zod';
import {
  BREADCRUMB_MAX,
  INTENTION_MAX_MINUTES,
  NEXT_ACTION_MAX,
  NOTES_MAX,
} from './limits';

/**
 * What the wizard remembers between steps (roadmap Wave 11).
 *
 * `ReviewDraft.decisions` is an open record in the storage schema; this module
 * is the one typed view of it. Reading is lenient per entry: a draft written by
 * an older build, or one whose referenced row has since been deleted, must
 * resume with whatever is still valid instead of failing the whole wizard.
 */

export const SweepActionSchema = z.enum(['keep', 'redefine', 'defer', 'drop']);
export type SweepAction = z.infer<typeof SweepActionSchema>;

export const SweepDecisionSchema = z.object({
  action: SweepActionSchema,
  nextAction: z.string().max(NEXT_ACTION_MAX).optional(),
  /** Local day key (YYYY-MM-DD) the task was deferred to. */
  deferUntil: z.string().max(10).optional(),
});
export type SweepDecision = z.infer<typeof SweepDecisionSchema>;

export const ProjectDecisionSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  breadcrumb: z.string().max(BREADCRUMB_MAX).nullable().optional(),
});
export type ProjectDecision = z.infer<typeof ProjectDecisionSchema>;

/** Minutes per domain id, for one week. */
export const IntentionsSchema = z.record(
  z.string().uuid(),
  z.number().int().min(0).max(INTENTION_MAX_MINUTES),
);
export type Intentions = z.infer<typeof IntentionsSchema>;

export interface ReviewDecisions {
  sweep: Record<string, SweepDecision>;
  projects: Record<string, ProjectDecision>;
  /** Intentions the user stated while reviewing (this week's balance). */
  weekIntentions: Intentions;
  /** Intentions for the week after the reviewed one; saved on the Review. */
  nextWeekIntentions: Intentions;
  notes: string;
}

export const EMPTY_DECISIONS: ReviewDecisions = {
  sweep: {},
  projects: {},
  weekIntentions: {},
  nextWeekIntentions: {},
  notes: '',
};

function intentionsOf(raw: unknown): Intentions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).flatMap(([domainId, minutes]) => {
    const parsed = z
      .object({ domainId: z.string().uuid(), minutes: z.number().int().min(0).max(INTENTION_MAX_MINUTES) })
      .safeParse({ domainId, minutes });
    return parsed.success ? [[parsed.data.domainId, parsed.data.minutes] as const] : [];
  });
  return Object.fromEntries(entries);
}

/** Normalise one intentions record, dropping entries that are no longer valid. */
export function normaliseIntentions(raw: unknown): Intentions {
  return IntentionsSchema.parse(intentionsOf(raw));
}

/** Read a stored `decisions` value, keeping every valid part. */
export function parseDecisions(raw: unknown): ReviewDecisions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY_DECISIONS };
  const record = raw as Record<string, unknown>;

  const sweepEntries = Object.entries(
    typeof record.sweep === 'object' && record.sweep !== null ? (record.sweep as Record<string, unknown>) : {},
  ).flatMap(([taskId, value]) => {
    if (!z.string().uuid().safeParse(taskId).success) return [];
    const parsed = SweepDecisionSchema.safeParse(value);
    return parsed.success ? [[taskId, parsed.data] as const] : [];
  });

  const projectEntries = Object.entries(
    typeof record.projects === 'object' && record.projects !== null
      ? (record.projects as Record<string, unknown>)
      : {},
  ).flatMap(([projectId, value]) => {
    if (!z.string().uuid().safeParse(projectId).success) return [];
    const parsed = ProjectDecisionSchema.safeParse(value);
    return parsed.success ? [[projectId, parsed.data] as const] : [];
  });

  const notes = typeof record.notes === 'string' ? record.notes.slice(0, NOTES_MAX) : '';

  return {
    sweep: Object.fromEntries(sweepEntries),
    projects: Object.fromEntries(projectEntries),
    weekIntentions: intentionsOf(record.weekIntentions),
    nextWeekIntentions: intentionsOf(record.nextWeekIntentions),
    notes,
  };
}

/** The value stored in `ReviewDraft.decisions`, with nothing unknown leaking in. */
export function serialiseDecisions(decisions: ReviewDecisions): Record<string, unknown> {
  return {
    sweep: decisions.sweep,
    projects: decisions.projects,
    weekIntentions: decisions.weekIntentions,
    nextWeekIntentions: decisions.nextWeekIntentions,
    notes: decisions.notes.slice(0, NOTES_MAX),
  };
}

/** Merge a partial update into one decisions record without mutating it. */
export function withSweep(
  decisions: ReviewDecisions,
  taskId: string,
  decision: SweepDecision,
): ReviewDecisions {
  return { ...decisions, sweep: { ...decisions.sweep, [taskId]: decision } };
}

export function withoutSweep(decisions: ReviewDecisions, taskId: string): ReviewDecisions {
  const next = { ...decisions.sweep };
  delete next[taskId];
  return { ...decisions, sweep: next };
}

export function withProjectDecision(
  decisions: ReviewDecisions,
  projectId: string,
  decision: ProjectDecision,
): ReviewDecisions {
  return {
    ...decisions,
    projects: { ...decisions.projects, [projectId]: { ...decisions.projects[projectId], ...decision } },
  };
}
