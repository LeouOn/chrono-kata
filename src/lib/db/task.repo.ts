import {
  TaskSchema,
  TaskInputSchema,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '@/lib/schemas/task';
import { applyTransition } from '@/lib/tasks/transitions';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface TaskRepository {
  getAll(): Promise<Task[]>;
  getById(id: string): Promise<Task | undefined>;
  byStatus(status: TaskStatus): Promise<Task[]>;
  byDomain(domainId: string): Promise<Task[]>;
  byProject(projectId: string): Promise<Task[]>;
  /** Subtasks of `parentId`. */
  children(parentId: string): Promise<Task[]>;
  /** Tasks not touched since `cutoff` (stale-since), any active status by default. */
  staleSince(cutoff: Date, statuses?: TaskStatus[]): Promise<Task[]>;
  create(input: TaskInput): Promise<Task>;
  update(id: string, patch: Partial<TaskInput>): Promise<Task>;
  /** Validated status change (see TASK_TRANSITIONS); bumps touchedAt, manages doneAt. */
  setStatus(id: string, status: TaskStatus, now?: Date): Promise<Task>;
  /** Field patch plus a validated status change, in ONE transaction. */
  updateStatus(id: string, patch: Partial<TaskInput>, status: TaskStatus, now?: Date): Promise<Task>;
  delete(id: string): Promise<void>;
}

const ACTIVE_STATUSES: TaskStatus[] = ['inbox', 'next', 'scheduled', 'waiting'];

export class DexieTaskRepository implements TaskRepository {
  async getAll(): Promise<Task[]> {
    const all = await getDb().tasks.toArray();
    return all.sort((a, b) => b.touchedAt.getTime() - a.touchedAt.getTime());
  }

  async getById(id: string): Promise<Task | undefined> {
    return getDb().tasks.get(id);
  }

  async byStatus(status: TaskStatus): Promise<Task[]> {
    return getDb().tasks.where('status').equals(status).toArray();
  }

  async byDomain(domainId: string): Promise<Task[]> {
    return getDb().tasks.where('domainId').equals(domainId).toArray();
  }

  async byProject(projectId: string): Promise<Task[]> {
    return getDb().tasks.where('projectId').equals(projectId).toArray();
  }

  async children(parentId: string): Promise<Task[]> {
    return getDb().tasks.where('parentId').equals(parentId).toArray();
  }

  async staleSince(cutoff: Date, statuses: TaskStatus[] = ACTIVE_STATUSES): Promise<Task[]> {
    const rows = await getDb().tasks.where('touchedAt').below(cutoff).toArray();
    return rows.filter((t) => statuses.includes(t.status));
  }

  async create(input: TaskInput): Promise<Task> {
    const parsed = TaskInputSchema.parse(input);
    const now = new Date();
    const task: Task = TaskSchema.parse({
      ...parsed,
      status: parsed.status ?? 'inbox',
      source: parsed.source ?? 'manual',
      id: newId(),
      createdAt: now,
      touchedAt: now,
      doneAt: null,
    });
    await getDb().tasks.put(task);
    return task;
  }

  async update(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const db = getDb();
    return db.transaction('rw', db.tasks, async () => {
      const existing = await db.tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated = TaskSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        touchedAt: new Date(),
        doneAt: existing.doneAt,
      });
      await db.tasks.put(updated);
      return updated;
    });
  }

  async updateStatus(
    id: string,
    patch: Partial<TaskInput>,
    status: TaskStatus,
    now: Date = new Date(),
  ): Promise<Task> {
    const db = getDb();
    return db.transaction('rw', db.tasks, async () => {
      const existing = await db.tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      // One transaction: a review decision that both changes a field and moves
      // the status (defer, for example) can never land half-applied.
      const transitioned = applyTransition({ ...existing, ...patch }, status, now);
      const updated = TaskSchema.parse({ ...transitioned, id: existing.id, createdAt: existing.createdAt });
      await db.tasks.put(updated);
      return updated;
    });
  }

  async setStatus(id: string, status: TaskStatus, now: Date = new Date()): Promise<Task> {
    const db = getDb();
    return db.transaction('rw', db.tasks, async () => {
      const existing = await db.tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated = applyTransition(existing, status, now);
      await db.tasks.put(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().tasks.delete(id);
  }
}

export const taskRepo: TaskRepository = new DexieTaskRepository();
