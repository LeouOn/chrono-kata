import { describe, it, expect } from 'vitest';
import { mapFetchError, mapResponseStatus } from '@/lib/llm/error-mapper';
import { LLMExceptionKind } from '@/lib/llm/types';

describe('mapResponseStatus', () => {
  it('401 → authFailed', () => {
    const e = mapResponseStatus(401, 'Unauthorized');
    expect(e).not.toBeNull();
    expect(e!.kind).toBe(LLMExceptionKind.AuthFailed);
    expect(e!.message).toMatch(/Authentication failed/i);
  });

  it('403 → authFailed', () => {
    expect(mapResponseStatus(403, 'Forbidden')!.kind).toBe(LLMExceptionKind.AuthFailed);
  });

  it('429 → rateLimited', () => {
    expect(mapResponseStatus(429, 'Too Many Requests')!.kind).toBe(LLMExceptionKind.RateLimited);
  });

  it('500 → provider', () => {
    expect(mapResponseStatus(500, 'Internal')!.kind).toBe(LLMExceptionKind.Provider);
  });

  it('200 → no throw (returns null)', () => {
    expect(mapResponseStatus(200, '')).toBeNull();
  });
});

describe('mapFetchError', () => {
  it('AbortError (timeout) → Timeout kind', () => {
    const e = new DOMException('Aborted', 'AbortError');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Timeout);
  });

  it('TypeError (network) → Provider kind with friendly message', () => {
    const e = new TypeError('Failed to fetch');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Provider);
    expect(mapped.message).toMatch(/network|connection/i);
  });

  it('unknown error → Unknown kind', () => {
    const e = new Error('something else');
    const mapped = mapFetchError(e);
    expect(mapped.kind).toBe(LLMExceptionKind.Unknown);
  });

  it('passes through LLMException unchanged', () => {
    const original = mapResponseStatus(401, 'no');
    const mapped = mapFetchError(original);
    expect(mapped).toBe(original);
  });
});
