import {
  ProjectSchema,
  ProjectInputSchema,
  type Project,
  type ProjectInput,
  type ProjectStatus,
} from '@/lib/schemas/project';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface ProjectRepository {
  getAll(): Promise<Project[]>;
  getById(id: string): Promise<Project | undefined>;
  byDomain(domainId: string): Promise<Project[]>;
  byStatus(status: ProjectStatus): Promise<Project[]>;
  /** Projects not touched since `cutoff` (stale-since), active ones first concern. */
  staleSince(cutoff: Date, statuses?: ProjectStatus[]): Promise<Project[]>;
  create(input: ProjectInput): Promise<Project>;
  update(id: string, patch: Partial<ProjectInput>): Promise<Project>;
  /** Bump lastTouchedAt (Wave 10 cadence debt builds on this). */
  touch(id: string, now?: Date): Promise<Project>;
  delete(id: string): Promise<void>;
}

/** A note's text as the app compares it: trimmed, and blank is "no note". */
function noteText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class DexieProjectRepository implements ProjectRepository {
  async getAll(): Promise<Project[]> {
    const all = await getDb().projects.toArray();
    return all.sort((a, b) => b.lastTouchedAt.getTime() - a.lastTouchedAt.getTime());
  }

  async getById(id: string): Promise<Project | undefined> {
    return getDb().projects.get(id);
  }

  async byDomain(domainId: string): Promise<Project[]> {
    return getDb().projects.where('domainId').equals(domainId).toArray();
  }

  async byStatus(status: ProjectStatus): Promise<Project[]> {
    return getDb().projects.where('status').equals(status).toArray();
  }

  async staleSince(cutoff: Date, statuses: ProjectStatus[] = ['active', 'paused']): Promise<Project[]> {
    const rows = await getDb().projects
      .where('lastTouchedAt')
      .below(cutoff)
      .toArray();
    return rows.filter((p) => statuses.includes(p.status));
  }

  async create(input: ProjectInput): Promise<Project> {
    const parsed = ProjectInputSchema.parse(input);
    const now = new Date();
    const project: Project = ProjectSchema.parse({
      ...parsed,
      id: newId(),
      lastTouchedAt: now,
      createdAt: now,
      updatedAt: now,
      ...(noteText(parsed.breadcrumb) !== '' ? { breadcrumbAt: now } : {}),
    });
    await getDb().projects.put(project);
    return project;
  }

  async update(id: string, patch: Partial<ProjectInput>): Promise<Project> {
    const db = getDb();
    return db.transaction('rw', db.projects, async () => {
      const existing = await db.projects.get(id);
      if (!existing) throw new Error(`Project ${id} not found`);
      const now = new Date();
      // The note's own time moves only when its TEXT changes: a write that merely
      // re-sends the same note (pausing in the weekly review, a cadence edit) must
      // not make an old note look new. Nothing a caller passes can set it.
      const noteChanged = 'breadcrumb' in patch && noteText(patch.breadcrumb) !== noteText(existing.breadcrumb);
      const updated = ProjectSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
        breadcrumbAt: noteChanged ? now : existing.breadcrumbAt,
      });
      await db.projects.put(updated);
      return updated;
    });
  }

  async touch(id: string, now: Date = new Date()): Promise<Project> {
    const db = getDb();
    return db.transaction('rw', db.projects, async () => {
      const existing = await db.projects.get(id);
      if (!existing) throw new Error(`Project ${id} not found`);
      const updated = ProjectSchema.parse({
        ...existing,
        lastTouchedAt: now,
        updatedAt: now,
      });
      await db.projects.put(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().projects.delete(id);
  }
}

export const projectRepo: ProjectRepository = new DexieProjectRepository();
