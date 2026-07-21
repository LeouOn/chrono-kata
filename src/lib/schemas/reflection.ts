import { z } from 'zod';

export const ReflectionSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.date(),
  periodEnd: z.date(),
  observations: z.array(z.string()).min(1).max(5),
  question: z.string().min(1).max(500),
  sourceSessionIds: z.array(z.string().uuid()),
  createdAt: z.date(),
});

export type Reflection = z.infer<typeof ReflectionSchema>;
