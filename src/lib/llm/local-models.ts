import { hostFromBaseUrl } from './local-provider';

/**
 * Model discovery and health check for a local OpenAI-compatible server
 * (LM Studio, Ollama, vLLM, …).
 *
 * The endpoint is `GET {baseUrl}/models`, the same one every OpenAI-compatible
 * server exposes. It doubles as a health check: a host that answers it is
 * reachable and serving.
 *
 * Failures are reported in words a person can act on — what was tried, and
 * what to check — because the usual cause is a server that is not running, a
 * wrong port, or a device that cannot reach that address on the network.
 */

export interface LocalModelsResult {
  /** True when the host answered. */
  ok: boolean;
  /** Model ids the host offered, sorted and de-duplicated. */
  models: string[];
  /** Present when `ok` is false. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

function pageIsHttps(): boolean {
  return typeof location !== 'undefined' && location.protocol === 'https:';
}

function describeTarget(baseUrl: string): string {
  const host = hostFromBaseUrl(baseUrl);
  return host ? `${host}` : baseUrl;
}

/**
 * Fetch the model list from a local server. Never throws: every failure comes
 * back as `{ ok: false, error }` with an actionable message.
 */
export async function fetchLocalModels(
  baseUrl: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LocalModelsResult> {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { ok: false, models: [], error: 'No host configured yet.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    url = null as unknown as URL;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return {
      ok: false,
      models: [],
      error: `"${trimmed}" is not a valid URL. Use a host such as http://localhost:1234/v1.`,
    };
  }

  if (url.protocol === 'http:' && pageIsHttps()) {
    return {
      ok: false,
      models: [],
      error:
        `The browser blocks plain-HTTP hosts from this HTTPS page (mixed content), so ${describeTarget(trimmed)} cannot be reached. ` +
        'Serve the app over http://localhost, put a TLS reverse proxy in front of the local server, or use a cloud provider.',
    };
  }

  const modelsUrl = `${trimmed.replace(/\/+$/, '')}/models`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;

  try {
    const response = await fetch(modelsUrl, { signal, cache: 'no-store' });
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: `${describeTarget(trimmed)} answered ${response.status} ${response.statusText}. Check that the local server is running and that ${modelsUrl} is the right address.`,
      };
    }
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> } | null;
    const models = Array.isArray(payload?.data)
      ? [...new Set(payload.data.map((entry) => (typeof entry?.id === 'string' ? entry.id : '')).filter(Boolean))].sort()
      : [];
    return { ok: true, models };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      models: [],
      error: aborted
        ? `${describeTarget(trimmed)} did not answer within ${Math.round(timeoutMs / 1000)}s. Check that the local server is running (LM Studio: Developer tab → Start Server; Ollama: ollama serve) and that the host and port are right.`
        : `Could not reach ${describeTarget(trimmed)} (${error instanceof Error ? error.message : String(error)}). Check that the local server is running (LM Studio: Developer tab → Start Server; Ollama: ollama serve), that the host and port are right, and that this device can reach that address on the network.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health check: is the local host up and serving models? Same request as the
 * model picker, reported as a short sentence.
 */
export async function checkLocalHost(
  baseUrl: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ ok: boolean; message: string; models: string[] }> {
  const result = await fetchLocalModels(baseUrl, options);
  if (!result.ok) {
    return { ok: false, message: result.error ?? 'The host did not answer.', models: [] };
  }
  const count = result.models.length;
  return {
    ok: true,
    message:
      count > 0
        ? `Host is up and serving ${count} model${count === 1 ? '' : 's'}.`
        : 'Host is up, but it reports no models. Load a model in the local server and check again.',
    models: result.models,
  };
}
