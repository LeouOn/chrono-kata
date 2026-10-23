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
    // `URL` normalises the host the same way the browser does: it lower-cases
    // it and rewrites decimal, octal and hex IPv4 forms (http://2130706433
    // becomes 127.0.0.1). Classifying by the normalised host is what keeps
    // this in step with where a request would actually go.
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A trailing dot is the same host ("localhost." === "localhost"). */
function withoutTrailingDot(host: string): string {
  return host.endsWith('.') ? host.slice(0, -1) : host;
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
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1`), which the URL parser keeps in hex
 * form. It reaches the same IPv4 address, so it counts as that address.
 */
function mappedIpv4(host: string): string | null {
  const match = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(host);
  if (!match) return null;
  const high = Number.parseInt(match[1] ?? '0', 16);
  const low = Number.parseInt(match[2] ?? '0', 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  const value = ((high << 16) | low) >>> 0;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

/**
 * True when the base URL points at this machine, a private network, or an
 * mDNS `.local` name — i.e. a host that is not a cloud provider.
 *
 * The host is compared exactly: a name that merely *starts* with a local
 * address ("localhost.evil.com") is not local, and userinfo or fragment
 * tricks cannot move the host.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  const raw = hostOf(baseUrl);
  if (!raw) return false;
  const host = withoutTrailingDot(raw);
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith('.local')) return true;
  if (isPrivateIpv4(host)) return true;
  const mapped = mappedIpv4(host);
  if (mapped && isPrivateIpv4(mapped)) return true;
  return false;
}

/**
 * The one predicate: is this request going to stay on the user's machine or
 * network?
 *
 * **The address decides, not the preset name.** A provider named `lmstudio`
 * whose base URL points at a cloud host is not local — the name is only a
 * label, and trusting it would let a request to a public address through
 * private mode. (The preset name is still what decides the *UI*: a local
 * preset gets a host field and a "Check host" button.)
 */
export function isLocalProvider(provider: { providerName: string; baseUrl: string }): boolean {
  return isLocalBaseUrl(provider.baseUrl);
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
