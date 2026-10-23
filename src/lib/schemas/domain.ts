import { z } from 'zod';

/**
 * A life area that groups projects, tasks and practice (Wave 1).
 * "Domain" never describes what a session was about — sessions keep
 * `activityLabel` and their own vocabulary.
 */
const DomainBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(50),
  /** Hex colour like '#4a90d9', used by future UI. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional(),
  order: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DomainSchema = DomainBaseSchema;
export type Domain = z.infer<typeof DomainSchema>;

export const DomainInputSchema = DomainBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DomainInput = z.infer<typeof DomainInputSchema>;
