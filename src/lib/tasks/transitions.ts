import type { Task, TaskStatus } from '@/lib/schemas/task';

/**
 * Pure task-status transition rules (roadmap Wave 1). A task enters `inbox`
 * from capture; triage moves it onward. `done` and `dropped` are terminal
 * but reopenable/revivable back into the active lists.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  inbox: ['next', 'scheduled', 'waiting', 'done', 'dropped'],
  next: ['inbox', 'scheduled', 'waiting', 'done', 'dropped'],
  scheduled: ['inbox', 'next', 'waiting', 'done', 'dropped'],
  waiting: ['inbox', 'next', 'done', 'dropped'],
  done: ['inbox', 'next'],
  dropped: ['inbox', 'next'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/**
 * Apply a status change: bumps `touchedAt`, sets `doneAt` exactly when the
 * new status is `done`, and refuses illegal transitions.
 */
export function applyTransition(task: Task, to: TaskStatus, now: Date = new Date()): Task {
  if (task.status === to) return { ...task, touchedAt: now };
  if (!canTransition(task.status, to)) {
    throw new Error(`Illegal task transition: ${task.status} -> ${to}`);
  }
  return { ...task, status: to, touchedAt: now, doneAt: to === 'done' ? now : null };
}
