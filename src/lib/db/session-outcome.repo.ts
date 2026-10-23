/**
 * One atomic write for a session that carries a task/project outcome.
 *
 * Why this exists: the session row, the task's actual minutes/status and the
 * project's breadcrumb must land together. If the task update fails after the
 * session is written (or the reverse), the user has a session that claims work
 * the task never received. A single Dexie transaction over sessions,
 * conversations, tasks and projects makes the whole thing all-or-nothing.
 *
 * Validation (a project breadcrumb is required) is returned, not thrown: the
 * caller shows the field. Nothing is written in that case.
 */

import { getDb } from './db';
import { sessionRepo } from './session.repo';
import { taskRepo } from './task.repo';
import { projectRepo } from './project.repo';
import { planSessionOutcome, type SessionOutcomePlan } from '@/lib/sessions/outcome';
import type { Session, SessionInput } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';

export type SaveSessionOutcomeResult =
  | {
      ok: true;
      session: Session;
      plan: SessionOutcomePlan;
      task?: Task;
      project?: Project;
    }
  | {
      ok: false;
      reason: 'project-breadcrumb-required';
      plan: SessionOutcomePlan;
    };

/**
 * Save a session and apply its task/project outcome atomically.
 *
 * Sessions without a `taskId`/`projectId` take the ordinary path, so practice
 * sessions are exactly as before (one session + conversation write).
 */
export async function saveSessionWithOutcome(
  input: SessionInput,
  now: Date = new Date(),
): Promise<SaveSessionOutcomeResult> {
  const sessionLike = {
    id: 'pending',
    durationMinutes: input.durationMinutes ?? null,
    reps: input.reps ?? null,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    outcome: input.outcome ?? null,
    breadcrumb: input.breadcrumb ?? null,
  };

  const hasLinks = Boolean(sessionLike.taskId || sessionLike.projectId);
  if (!hasLinks) {
    const session = await sessionRepo.save(input);
    return {
      ok: true,
      session,
      plan: planSessionOutcome({ ...sessionLike, id: session.id }, null, null),
    };
  }

  const db = getDb();
  return db.transaction('rw', [db.sessions, db.conversations, db.tasks, db.projects], async () => {
    const task = sessionLike.taskId ? await db.tasks.get(sessionLike.taskId) : undefined;
    const project = sessionLike.projectId ? await db.projects.get(sessionLike.projectId) : undefined;

    const plan = planSessionOutcome(sessionLike, task, project);
    // An orphaned link (the task/project was deleted, or a restored backup
    // references one that is gone) must never cost the user their session:
    // save it, keep the link id as history, and report what could not be
    // updated. A write failure is different and still rolls everything back.
    if (sessionLike.taskId && !task) plan.warnings.push('linked task no longer exists');
    if (sessionLike.projectId && !project) plan.warnings.push('linked project no longer exists');
    if (!plan.validation.ok) {
      return { ok: false, reason: plan.validation.reason, plan };
    }

    const session = await sessionRepo.save(input);

    let updatedTask = task;
    if (plan.task) {
      if (Object.keys(plan.task.patch).length > 0) {
        updatedTask = await taskRepo.update(plan.task.id, plan.task.patch);
      }
      if (plan.task.status) {
        updatedTask = await taskRepo.setStatus(plan.task.id, plan.task.status, now);
      }
    }

    let updatedProject = project;
    if (plan.project) {
      updatedProject = await projectRepo.update(plan.project.id, plan.project.patch);
      updatedProject = await projectRepo.touch(plan.project.id, now);
    }

    return { ok: true, session, plan, task: updatedTask, project: updatedProject };
  });
}
