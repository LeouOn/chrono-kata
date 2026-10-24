import { getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import type { Decomposition } from './schema';

/**
 * Wave 3 part 2: apply a confirmed decomposition. All-or-nothing — the
 * next-action update and every picked subtask go through ONE Dexie
 * transaction, so a validation failure (e.g. an over-long step title)
 * rolls back the whole apply. A partially-saved decomposition is worse
 * than none: it looks applied and silently loses steps.
 */

export class ApplyTargetGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplyTargetGoneError';
  }
}

export interface ApplyInput {
  /** The task the decomposition was generated FOR (run.taskId), not whatever
   *  the live prop points at by the time Confirm is pressed. */
  taskId: string;
  decomposition: Decomposition;
  /** Indices into decomposition.steps the user picked. */
  checkedSteps: number[];
  useAsNextAction: boolean;
}

export async function confirmApply(input: ApplyInput): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(input.taskId);
    if (!task) {
      throw new ApplyTargetGoneError('That task is gone, so nothing was saved.');
    }
    if (task.status === 'done' || task.status === 'dropped') {
      throw new ApplyTargetGoneError('That task left the inbox, so nothing was saved.');
    }

    if (input.useAsNextAction) {
      await taskRepo.update(task.id, { nextAction: input.decomposition.firstAction });
    }

    const steps = input.decomposition.steps ?? [];
    for (const i of input.checkedSteps) {
      const step = steps[i];
      if (!step) continue;
      await taskRepo.create({
        title: step.title,
        parentId: task.id,
        projectId: task.projectId ?? null,
        domainId: task.domainId ?? null,
        status: 'inbox',
        source: 'ai',
        estimateMin: step.minutes,
      });
    }
  });
}
