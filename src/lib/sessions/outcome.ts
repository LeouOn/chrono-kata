/**
 * Session outcome and breadcrumb core (roadmap Wave 9 part 1).
 *
 * Pure: given a finished session that is linked to a task and/or a project,
 * decide what the repositories should change. No Dexie, no React, no LLM.
 *
 * Rules (documented decisions, see docs/waves/wave-09.md):
 * - **actualMin accumulates**: each timed session adds its `durationMinutes`
 *   to `Task.actualMin`; reps-only sessions add nothing (they have no minutes).
 *   Fractions are kept at 30-second precision and rounded to two decimals to
 *   avoid float drift. Several sessions on one task therefore sum.
 * - **outcome**: `done` -> task status `done`, `progress` -> status unchanged,
 *   `blocked` -> status `waiting`. Illegal transitions are reported as warnings
 *   (from `done`/`dropped`, for example) and leave the status alone.
 * - **breadcrumb**: required for a project (the caller shows a validation
 *   result, not an exception), optional for a task. When present it is written
 *   to `Project.breadcrumb`, and for a task it is proposed as
 *   `Task.nextAction` (the roadmap's denormalized next step).
 * - A session with no task/project link produces an empty plan: practice
 *   sessions behave exactly as before.
 */

import { canTransition } from '@/lib/tasks/transitions';
import type { SessionOutcome } from '@/lib/schemas/session';
import type { ProjectInput } from '@/lib/schemas/project';
import type { TaskInput, TaskStatus } from '@/lib/schemas/task';

export const BREADCRUMB_MAX = 500;

/** A finished session, reduced to the fields this module needs. */
export interface SessionOutcomeInput {
  id: string;
  durationMinutes?: number | null;
  reps?: number | null;
  taskId?: string | null;
  projectId?: string | null;
  outcome?: SessionOutcome | null;
  breadcrumb?: string | null;
}

export interface TaskContext {
  id: string;
  status: TaskStatus;
  actualMin?: number | null;
}

export interface ProjectContext {
  id: string;
}

export type OutcomePlanStatus =
  | { ok: true }
  | { ok: false; reason: 'project-breadcrumb-required' };

export interface SessionOutcomePlan {
  /** Cleaned breadcrumb ('' when none was given). */
  breadcrumb: string;
  /** Field patch and optional target status for the linked task. */
  task?: { id: string; patch: Partial<TaskInput>; status?: TaskStatus };
  /** Field patch for the linked project. */
  project?: { id: string; patch: Partial<ProjectInput> };
  validation: OutcomePlanStatus;
  /** Non-fatal notes: illegal transitions, ignored reps-only minutes. */
  warnings: string[];
}

const BREADCRUMB_PREFIX =
  /^(?:pick\s+up\s+here(?:\s+next\s+time)?|where\s+i\s+left\s+off|next(?:\s+time)?|continue\s+with)\s*[:\-–—]\s*/i;

/**
 * Normalize a typed breadcrumb: trim, drop a leading "Pick up here next time:"
 * style prefix, collapse whitespace, and cap at the Task.nextAction limit.
 * Returns '' when nothing useful remains (never null, never an exception).
 */
export function cleanBreadcrumb(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const withoutPrefix = raw.trim().replace(BREADCRUMB_PREFIX, '');
  const collapsed = withoutPrefix.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, BREADCRUMB_MAX).trim();
}

/** Round to two decimals: 30-second precision survives, float drift does not. */
function roundMinutes(value: number): number {
  return Math.round(value * 100) / 100;
}

export function accumulateActualMinutes(
  current: number | null | undefined,
  sessionMinutes: number | null | undefined,
): number | undefined {
  if (typeof sessionMinutes !== 'number' || !Number.isFinite(sessionMinutes) || sessionMinutes <= 0) {
    return undefined;
  }
  const base = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  return roundMinutes(base + sessionMinutes);
}

/**
 * Compute the repository updates for one saved session.
 *
 * @param session the finished session (links, minutes, outcome, breadcrumb)
 * @param task the linked task row, when the session has one
 * @param project the linked project row, when the session has one
 */
export function planSessionOutcome(
  session: SessionOutcomeInput,
  task: TaskContext | null | undefined,
  project: ProjectContext | null | undefined,
): SessionOutcomePlan {
  const warnings: string[] = [];
  const breadcrumb = cleanBreadcrumb(session.breadcrumb);
  const plan: SessionOutcomePlan = {
    breadcrumb,
    validation: { ok: true },
    warnings,
  };

  // Required for projects, optional for tasks. Reported, not thrown.
  if (project && breadcrumb === '') {
    plan.validation = { ok: false, reason: 'project-breadcrumb-required' };
    return plan;
  }

  if (task) {
    const patch: Partial<TaskInput> = {};

    // Minutes: timed sessions only; a reps-only session has no minutes.
    if (typeof session.durationMinutes === 'number') {
      const actualMin = accumulateActualMinutes(task.actualMin, session.durationMinutes);
      if (actualMin !== undefined) patch.actualMin = actualMin;
    } else if (typeof session.reps === 'number') {
      warnings.push('reps-only session adds no actual minutes');
    }

    // Breadcrumb for a task becomes the proposed next action.
    if (breadcrumb !== '') patch.nextAction = breadcrumb;

    const target = targetStatus(session.outcome);
    let status: TaskStatus | undefined;
    if (target) {
      if (target === task.status) {
        // Already there; not an error, and nothing to change.
      } else if (canTransition(task.status, target)) {
        status = target;
      } else {
        warnings.push(
          `outcome "${session.outcome}" wants status "${target}", which is not reachable from "${task.status}"`,
        );
      }
    }

    plan.task = { id: task.id, patch, ...(status ? { status } : {}) };
  }

  if (project) {
    plan.project = { id: project.id, patch: { breadcrumb } };
  }

  return plan;
}

function targetStatus(outcome: SessionOutcome | null | undefined): TaskStatus | undefined {
  switch (outcome) {
    case 'done':
      return 'done';
    case 'blocked':
      return 'waiting';
    case 'progress':
    default:
      return undefined;
  }
}
