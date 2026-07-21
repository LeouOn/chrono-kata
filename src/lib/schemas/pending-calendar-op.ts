import { z } from 'zod';

export const PendingCalendarOpSchema = z.object({
  id: z.string().uuid(),
  op: z.enum(['create', 'update', 'delete']),
  sessionId: z.string().uuid(),
  payload: z.record(z.unknown()).optional(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  createdAt: z.date(),
});

export type PendingCalendarOp = z.infer<typeof PendingCalendarOpSchema>;
