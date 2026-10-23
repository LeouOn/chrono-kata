import { z } from 'zod';

export const BlockKindSchema = z.enum(['fixed', 'anchor', 'focus']);
export type BlockKind = z.infer<typeof BlockKindSchema>;

/**
 * A calendar-shaped time slot. Fixed events and anchors are commitments;
 * focus blocks are chosen work time (roadmap Wave 7 builds the timeline on
 * this). `calendarRef` links a synced external event.
 */
const BlockBaseSchema = z.object({
  id: z.string().uuid(),
  start: z.date(),
  end: z.date(),
  kind: BlockKindSchema,
  taskId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1, 'Title is required').max(200),
  /** External calendar event id, when this block mirrors one. */
  calendarRef: z.string().max(200).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const BlockSchema = BlockBaseSchema.refine((b) => b.end > b.start, {
  message: 'end must be after start.',
});
export type Block = z.infer<typeof BlockSchema>;

export const BlockInputSchema = BlockBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BlockInput = z.infer<typeof BlockInputSchema>;
