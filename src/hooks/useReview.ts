'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewRepo } from '@/lib/db/review.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import type { ProjectInput } from '@/lib/schemas/project';
import type { ReviewPatch } from '@/lib/schemas/review';
import type { TaskInput, TaskStatus } from '@/lib/schemas/task';

const REVIEW_KEY = ['review'] as const;
const LATEST_DRAFT_KEY = ['review', 'draft', 'latest'] as const;

function reviewKey(weekOf: string) {
  return ['review', weekOf] as const;
}

function draftKey(weekOf: string) {
  return ['review', 'draft', weekOf] as const;
}

/** One week's completed review, or null. */
export function useReview(weekOf: string) {
  return useQuery({
    queryKey: reviewKey(weekOf),
    queryFn: () => reviewRepo.getByWeek(weekOf),
  });
}

/** The draft to resume, whatever week it belongs to, or null. */
export function useLatestDraft() {
  return useQuery({
    queryKey: LATEST_DRAFT_KEY,
    queryFn: () => reviewRepo.latestDraft(),
  });
}

/**
 * Draft saving and completion.
 *
 * Both seed the caches they own on success, so a refetch never flashes an empty
 * state, and completing a review invalidates every surface it changed.
 */
export function useReviewWrites() {
  const qc = useQueryClient();

  const saveDraft = useMutation({
    mutationFn: (input: { weekOf: string; step: number; decisions: Record<string, unknown> }) =>
      reviewRepo.saveDraft(input.weekOf, { step: input.step, decisions: input.decisions }),
    onSuccess: (draft) => {
      qc.setQueryData(draftKey(draft.weekOf), draft);
      qc.setQueryData(LATEST_DRAFT_KEY, draft);
    },
  });

  /** Drop one unfinished draft. Only called from the explicit discard choice. */
  const discardDraft = useMutation({
    mutationFn: (weekOf: string) => reviewRepo.deleteDraft(weekOf),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['review'] });
    },
  });

  const complete = useMutation({
    mutationFn: (input: { weekOf: string; patch: ReviewPatch }) =>
      reviewRepo.complete(input.weekOf, input.patch),
    onSuccess: (review) => {
      qc.setQueryData(reviewKey(review.weekOf), review);
      void qc.invalidateQueries({ queryKey: ['review'] });
      // The sweep and the project step already invalidated these; completing a
      // review changes the weekly numbers that other cards read, so refresh them.
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return { saveDraft, complete, discardDraft };
}

interface SweepWrite {
  taskId: string;
  patch?: Partial<TaskInput>;
  status?: TaskStatus;
}

/**
 * Apply one review decision to a task. A status change and a field change land
 * together in one repository transaction, and every task surface is invalidated.
 */
export function useSweepTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, patch, status }: SweepWrite) =>
      status
        ? taskRepo.updateStatus(taskId, patch ?? {}, status)
        : taskRepo.update(taskId, patch ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Save one project's bracket of the review (breadcrumb, status, cadence). */
export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, patch }: { projectId: string; patch: Partial<ProjectInput> }) =>
      projectRepo.update(projectId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
