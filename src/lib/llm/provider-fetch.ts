import type { ProviderConfig } from './provider-config';

/** Keep native provider responses (including SSE), but inject desktop keys on the server. */
export function providerFetch(config: ProviderConfig, url: string, options: RequestInit): Promise<Response> {
  if (config.credentialSource !== 'environment') return fetch(url, options);
  const body = JSON.parse(String(options.body)) as Record<string, unknown>;
  return fetch('/api/local-ai', {
    method: 'POST', signal: options.signal, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-chrono-local-ai': '1' },
    body: JSON.stringify({ providerName: config.providerName, model: config.model, body,
      stream: body.stream === true || url.includes(':streamGenerateContent'),
    }),
  });
}
