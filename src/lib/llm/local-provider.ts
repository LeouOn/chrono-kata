/**
 * What counts as a **local** provider.
 *
 * Two ways to be local:
 * - the provider preset is one of the local ones (LM Studio, Ollama), or
 * - the base URL points at a loopback or private-network address the user set
 *   themselves (a LAN host such as `http://192.168.1.5:1234/v1`).
 *
 * Private mode (roadmap W5) is enforced through this one predicate, so
 * "no request may go to a non-local provider" stays a single check instead of
 * a list that can drift.
 */

/** Presets that always run on the user's own machine or network. */
export const LOCAL_PROVIDER_NAMES = ['ollama', 'lmstudio'] as const;
export type LocalProviderName = (typeof LOCAL_PROVIDER_NAMES)[number];

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'host.docker.internal',
]);

/** True when the provider preset itself is a local one. */
export function isLocalProviderName(name: string): boolean {
  return (LOCAL_PROVIDER_NAMES as readonly string[]).includes(name);
}

function hostOf(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** RFC1918 / loopback / link-local IPv4. */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = numbers[0] ?? -1;
  const b = numbers[1] ?? -1;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * True when the base URL points at this machine, a private network, or an
 * mDNS `.local` name — i.e. a host that is not a cloud provider.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  const host = hostOf(baseUrl);
  if (!host) return false;
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith('.local')) return true;
  return isPrivateIpv4(host);
}

/**
 * The one predicate: a provider is local when its preset is local or its base
 * URL is a local address.
 */
export function isLocalProvider(provider: { providerName: string; baseUrl: string }): boolean {
  return isLocalProviderName(provider.providerName) || isLocalBaseUrl(provider.baseUrl);
}

/**
 * The host (with port) of a base URL — `http://localhost:1234/v1` becomes
 * `localhost:1234`. Returns an empty string when the URL cannot be parsed.
 */
export function hostFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return '';
  }
}

/**
 * Build a base URL from a host such as `localhost:1234` or `192.168.1.5:1234`.
 * The path defaults to the OpenAI-compatible `/v1`.
 */
export function baseUrlFromHost(host: string, path = '/v1'): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const suffix = path && !path.startsWith('/') ? `/${path}` : path;
  return `${withScheme.replace(/\/+$/, '')}${suffix}`;
}
