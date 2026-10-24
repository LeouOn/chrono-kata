import { REVIEW_STEP_COUNT } from '@/lib/schemas/review';

/**
 * The six steps of the weekly review (roadmap Wave 11), in order. The step
 * index is what a draft stores, so the order is part of the persisted contract:
 * appending is fine, reordering needs a draft migration.
 */
export type ReviewStepId = 'inbox' | 'waiting' | 'projects' | 'balance' | 'estimate' | 'shape';

export interface ReviewStep {
  id: ReviewStepId;
  title: string;
  hint: string;
}

export const REVIEW_STEPS: readonly ReviewStep[] = [
  {
    id: 'inbox',
    title: 'Clear the inbox',
    hint: 'Sort what is still waiting to be decided.',
  },
  {
    id: 'waiting',
    title: 'Sweep waiting tasks',
    hint: 'Keep, reshape, defer, or let go. Nothing is deleted.',
  },
  {
    id: 'projects',
    title: 'Projects',
    hint: 'Where each one stands and what comes next.',
  },
  {
    id: 'balance',
    title: 'Domain balance',
    hint: 'Time this week against what you intended.',
  },
  {
    id: 'estimate',
    title: 'Estimates',
    hint: 'How long things took against the plan.',
  },
  {
    id: 'shape',
    title: 'Shape next week',
    hint: 'Rough intentions per domain and a rhythm per project.',
  },
];

/** Clamp a stored step into the wizard's range. */
export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(REVIEW_STEP_COUNT - 1, Math.max(0, Math.trunc(step)));
}

export function stepAt(index: number): ReviewStep {
  return REVIEW_STEPS[clampStep(index)] ?? REVIEW_STEPS[0]!;
}
