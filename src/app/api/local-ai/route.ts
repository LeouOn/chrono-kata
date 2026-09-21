import { z } from 'zod';
import { adapterFor } from '@/lib/llm/provider-defaults';
import { isLocalAIRequest, resolveEnvironmentProviders } from '@/lib/llm/server/environment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!isLocalAIRequest(request)) return Response.json({ providers: {} }, { headers });
  const providers = Object.fromEntries(Object.entries(resolveEnvironmentProviders()).map(([name, config]) => [name, {
    baseUrl: config.baseUrl, model: config.model, apiKey: '', credentialSource: 'environment',
  }]));
  const preferred = ['deepseek', 'zai', 'openrouter'].find((name) => providers[name]) ?? '';
  return Response.json({ providers, defaultProvider: process.env.DEFAULT_PROVIDER || preferred }, { headers });
}

const RequestSchema = z.object({
  providerName: z.string().min(1).max(50),
  model: z.string().min(1).max(200),
  body: z.record(z.unknown()),
  stream: z.boolean(),
});

export async function POST(request: Request) {
  if (!isLocalAIRequest(request)) return Response.json({ error: 'Local AI is unavailable.' }, { status: 403, headers });
  let parsed: z.infer<typeof RequestSchema>;
  try {
    const text = await request.text();
    if (text.length > 500_000) return new Response(null, { status: 413, headers });
    parsed = RequestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: 'Invalid AI request.' }, { status: 400, headers });
  }
  const config = resolveEnvironmentProviders()[parsed.providerName];
  if (!config) return Response.json({ error: 'Environment provider unavailable.' }, { status: 404, headers });
  const adapter = adapterFor(parsed.providerName);
  const base = config.baseUrl.replace(/\/$/, '');
  const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  const body = { ...parsed.body };
  if (adapter === 'gemini') {
    url = `${base}/models/${encodeURIComponent(parsed.model)}:${parsed.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    upstreamHeaders['x-goog-api-key'] = config.apiKey;
  } else {
    body.model = parsed.model;
    body.stream = parsed.stream;
    url = `${base}/${adapter === 'claude' ? 'messages' : 'chat/completions'}`;
    if (adapter === 'claude') {
      upstreamHeaders['x-api-key'] = config.apiKey;
      upstreamHeaders['anthropic-version'] = '2023-06-01';
    } else upstreamHeaders.Authorization = `Bearer ${config.apiKey}`;
  }
  try {
    const upstream = await fetch(url, {
      method: 'POST', headers: upstreamHeaders, body: JSON.stringify(body),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      redirect: 'error', cache: 'no-store',
    });
    // Don't forward arbitrary provider errors/headers that may echo credentials.
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return Response.json({ error: `Provider returned ${upstream.status}. Check the model and credentials.` }, { status: upstream.status, headers });
    }
    return new Response(upstream.body, { headers: {
      ...headers, 'Content-Type': parsed.stream ? 'text/event-stream' : 'application/json',
    } });
  } catch {
    return Response.json({ error: 'Provider connection failed or timed out.' }, { status: 502, headers });
  }
}
