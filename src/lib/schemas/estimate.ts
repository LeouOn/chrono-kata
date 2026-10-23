import { z } from 'zod';

/**
 * One estimate of a task's size, by source. `source` is 'user' or a provider
 * id — Wave 4 stores every model's guess so analytics can score which source
 * is best calibrated for this user.
 */
const EstimateBaseSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  source: z.string().min(1).max(50),
  minutes: z.number().int().positive().max(10080),
  rationale: z.string().max(1000).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EstimateSchema = EstimateBaseSchema;
export type Estimate = z.infer<typeof EstimateSchema>;

export const EstimateInputSchema = EstimateBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EstimateInput = z.infer<typeof EstimateInputSchema>;
