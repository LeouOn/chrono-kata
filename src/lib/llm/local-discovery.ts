import { z } from 'zod';
import { ProviderEntrySchema } from '@/lib/schemas/llm-settings';

const DiscoverySchema = z.object({
  providers: z.record(ProviderEntrySchema),
  defaultProvider: z.string().optional(),
});
type Discovery = z.infer<typeof DiscoverySchema>;
let pending: Promise<Discovery> | undefined;
let cachedUntil = 0;

export async function discoverLocalProviders(refresh = false): Promise<Discovery> {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    return { providers: {} };
  }
  if (!refresh && pending && Date.now() < cachedUntil) return pending;
  cachedUntil = Date.now() + 15_000;
  pending = (async () => {
    try {
      const response = await fetch('/api/local-ai', {
        headers: { 'x-chrono-local-ai': '1' }, cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { providers: {} };
      return DiscoverySchema.parse(await response.json());
    } catch {
      return { providers: {} };
    }
  })();
  return pending;
}
