import { z } from 'zod';

export const ProjectStatusSchema = z.enum(['active', 'paused', 'done', 'dropped']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * A long-running effort inside a domain, kept alive through small regular
 * sessions instead of heroic pushes (Wave 1 / roadmap Wave 10).
 */
const ProjectBaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  domainId: z.string().uuid().nullable().optional(),
  status: ProjectStatusSchema,
  /** Target sessions per week; Wave 10's cadence debt uses this. */
  cadencePerWeek: z.number().int().min(1).max(7).nullable().optional(),
  /**
   * Wave 10: how long one block should be, in minutes ("2 blocks a week,
   * 45 min"). With it, a session earns the share of a block its minutes cover.
   * Inert without `cadencePerWeek`. Optional and not indexed (no Dexie bump).
   */
  cadenceBlockMin: z.number().int().min(5).max(240).nullable().optional(),
  /**
   * Wave 10: local days without work before the project is offered a gentle
   * revive. Absent means "derive it from the project's own rhythm".
   */
  stallAfterDays: z.number().int().min(3).max(365).nullable().optional(),
  /** Latest denormalized next step ("after this, do X"). */
  breadcrumb: z.string().max(500).nullable().optional(),
  lastTouchedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ProjectSchema = ProjectBaseSchema;
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectInputSchema = ProjectBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTouchedAt: true,
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;
