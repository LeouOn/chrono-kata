import { z } from 'zod';

export const TokenSchema = z.object({
  id: z.literal('google'),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.date(),
});

export type Token = z.infer<typeof TokenSchema>;
