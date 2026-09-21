import { PROVIDER_DEFAULTS, type ProviderName } from '../provider-defaults';

// Only imported by route handlers. Never return these credentials to a browser.
export function resolveEnvironmentProviders(env: Record<string, string | undefined> = process.env) {
  const aliases: Partial<Record<ProviderName, string[]>> = {
    openai: ['OPENAI_API_KEY'], openrouter: ['OPENROUTER_API_KEY'],
    claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'],
    zai: ['ZAI_API_KEY', 'Z_AI_API_KEY'], minimax: ['MINIMAX_API_KEY'],
    nemotron: ['NEMOTRON_API_KEY'],
  };
  const providers: Record<string, { baseUrl: string; apiKey: string; model: string }> = {};
  for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
    const prefix = name.toUpperCase();
    const key = name === 'ollama'
      ? (env.OLLAMA_ENABLED === 'true' || env.OLLAMA_BASE_URL ? 'ollama' : '')
      : aliases[name as ProviderName]?.map((keyName) => env[keyName]?.trim()).find(Boolean);
    if (!key) continue;
    providers[name] = {
      apiKey: key,
      baseUrl: env[`${prefix}_BASE_URL`]?.trim() || defaults.baseUrl,
      model: env[`${prefix}_MODEL`]?.trim() || defaults.model,
    };
  }
  return providers;
}

export function isLocalAIRequest(request: Request): boolean {
  if (process.env.CHRONO_LOCAL_AI !== 'true') return false;
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
  // Next may normalize request.url to localhost even when the browser uses
  // 127.0.0.1. Validate the actual Host separately, then match Origin to it.
  const host = request.headers.get('host') || url.host;
  let authority: URL;
  try { authority = new URL(`${url.protocol}//${host}`); } catch { return false; }
  if (authority.host !== host || !['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname)) return false;
  if (request.headers.get('x-chrono-local-ai') !== '1') return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  return !origin || origin === authority.origin;
}
