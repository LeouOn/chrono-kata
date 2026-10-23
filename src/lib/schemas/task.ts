import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'inbox',
  'next',
  'scheduled',
  'waiting',
  'done',
  'dropped',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskEnergySchema = z.enum(['low', 'med', 'high']);
export type TaskEnergy = z.infer<typeof TaskEnergySchema>;

export const TaskSourceSchema = z.enum(['manual', 'voice', 'share', 'ai', 'import']);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

/**
 * A work item. A task is never a session: sessions record practice that
 * happened; tasks are what you intend to do. Optional links let a session
 * record which task/project/block it served without merging the vocabularies.
 */
const TaskBaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  /** The smallest startable next action (≤ 25 min, startable in 5). */
  nextAction: z.string().max(500).nullable().optional(),
  domainId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  /** Subtask link; Wave 3 saves AI-proposed steps this way. */
  parentId: z.string().uuid().nullable().optional(),
  status: TaskStatusSchema,
  /** Planned size in whole minutes. */
  estimateMin: z.number().int().positive().max(10080).nullable().optional(),
  /** Fractional minutes allowed (30-second precision, like sessions). */
  actualMin: z.number().finite().positive().nullable().optional(),
  energy: TaskEnergySchema.nullable().optional(),
  /** Where the task can be done, e.g. ["hardware-store", "home"]. */
  context: z.array(z.string().min(1).max(50)).max(10).nullable().optional(),
  dueAt: z.date().nullable().optional(),
  deferUntil: z.date().nullable().optional(),
  source: TaskSourceSchema,
  createdAt: z.date(),
  /** Last meaningful touch; drives the stale-since query. */
  touchedAt: z.date(),
  doneAt: z.date().nullable().optional(),
});

export const TaskSchema = TaskBaseSchema.refine(
  (t) => (t.status === 'done') === (t.doneAt != null),
  { message: 'doneAt must be set exactly when status is done.' },
);
export type Task = z.infer<typeof TaskSchema>;

export const TaskInputSchema = TaskBaseSchema.omit({
  id: true,
  createdAt: true,
  touchedAt: true,
  doneAt: true,
}).partial({
  status: true,
  source: true,
});
export type TaskInput = z.infer<typeof TaskInputSchema>;
