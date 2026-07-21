import { z } from 'zod';

const ProviderEntrySchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

export const LLMSettingsSchema = z.object({
  id: z.literal('singleton'),
  activeProviderName: z.string().min(1),
  providers: z.record(z.string().min(1), ProviderEntrySchema),
  totalTokensThisMonth: z.number().int().nonnegative(),
  totalTokensResetAt: z.date(),
  updatedAt: z.date(),
});

export type LLMSettings = z.infer<typeof LLMSettingsSchema>;
