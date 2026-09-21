import { z } from 'zod';

export const ProviderEntrySchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string(),
  credentialSource: z.enum(['browser', 'environment']).optional(),
});
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

export const LLMSettingsSchema = z.object({
  id: z.literal('singleton'),
  activeProviderName: z.string(),
  dismissedEnvironmentProviders: z.array(z.string()).optional(),
  providers: z.record(z.string().min(1), ProviderEntrySchema),
  totalTokensThisMonth: z.number().int().nonnegative(),
  totalTokensResetAt: z.date(),
  updatedAt: z.date(),
});

export type LLMSettings = z.infer<typeof LLMSettingsSchema>;
