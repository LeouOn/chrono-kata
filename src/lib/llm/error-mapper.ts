import { LLMException, LLMExceptionKind } from './types';

/**
 * Map an HTTP status code to a typed LLMException, or return null if the
 * status represents success (2xx).
 */
export function mapResponseStatus(status: number, statusText: string): LLMException | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) {
    return new LLMException(
      'Authentication failed. Check your API key in LLM settings.',
      LLMExceptionKind.AuthFailed
    );
  }
  if (status === 429) {
    return new LLMException(
      'Rate limit exceeded. Try again in a moment.',
      LLMExceptionKind.RateLimited
    );
  }
  if (status === 400 || status === 404) {
    return new LLMException(
      `Provider rejected the request (${status}). Check the selected model and base URL in LLM settings.`,
      LLMExceptionKind.Provider,
    );
  }
  return new LLMException(
    `Provider error (${status}${statusText ? ' ' + statusText : ''}).`,
    LLMExceptionKind.Provider
  );
}

/**
 * Map any caught error from a fetch call into a typed LLMException.
 * LLMException instances pass through unchanged.
 */
export function mapFetchError(e: unknown): LLMException {
  if (e instanceof LLMException) return e;
  if (e instanceof DOMException && e.name === 'AbortError') {
    return new LLMException(
      'Connection timed out. Check your network.',
      LLMExceptionKind.Timeout
    );
  }
  if (e instanceof TypeError) {
    // Native fetch throws TypeError on network failure (DNS, CORS, offline).
    return new LLMException(
      'Network error — check your connection.',
      LLMExceptionKind.Provider
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new LLMException(msg, LLMExceptionKind.Unknown);
}
