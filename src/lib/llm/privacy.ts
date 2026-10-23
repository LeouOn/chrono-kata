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
