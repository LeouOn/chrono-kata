import { LLMException, LLMExceptionKind } from './types';
import { isLocalProvider } from './local-provider';
import type { ProviderConfig } from './provider-config';

/**
 * Private mode (roadmap W5): when it is on, nothing may leave the device
 * except to a local provider.
 *
 * The check lives on the provider, not on the URL, so it also covers the
 * desktop-key path where the request is proxied through the loopback server.
 */
export function assertProviderAllowed(config: ProviderConfig, privateMode: boolean): void {
  if (!privateMode) return;
  if (isLocalProvider(config)) return;
  throw new LLMException(
    `Private mode is on, so nothing may be sent to ${config.providerName} (${config.baseUrl}). ` +
      'Configure a local provider (LM Studio or Ollama) or turn private mode off in Settings.',
    LLMExceptionKind.PrivacyBlocked,
  );
}

/** True when the provider may be used while private mode is on. */
export function isProviderAllowed(config: ProviderConfig, privateMode: boolean): boolean {
  if (!privateMode) return true;
  return isLocalProvider(config);
}

/**
 * The fetch options every adapter must add while private mode is on.
 *
 * `redirect: 'error'` stops the browser from following a 3xx to somewhere
 * else: a "local" server that redirects to a public address would otherwise
 * carry the request body off the machine. Outside private mode nothing
 * changes, so a user's own http→https reverse proxy keeps working.
 */
export function privateModeFetchOptions(config: ProviderConfig): { redirect?: 'error' } {
  return config.privateMode ? { redirect: 'error' } : {};
}

/**
 * A clear message for a request that failed while private mode was on.
 *
 * The browser cannot tell "the host redirected" from "the host is not there"
 * — both reject the fetch — so the message names both, and says what to do.
 * Timeouts and other failures keep their own message.
 */
export function privateModeFetchError(config: ProviderConfig, error: unknown): LLMException | null {
  if (!config.privateMode) return null;
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  if (!(error instanceof TypeError)) return null;
  return new LLMException(
    `The local server at ${config.baseUrl} could not be reached, or it tried to redirect somewhere else. ` +
      'Private mode does not follow redirects: point the base URL at the address that answers directly, ' +
      'and check that the server is running.',
    LLMExceptionKind.PrivacyBlocked,
  );
}
