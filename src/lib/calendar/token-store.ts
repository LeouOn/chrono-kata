import { tokensRepo } from '@/lib/db/tokens.repo';
import { requestCalendarTokens } from './gis';

const SAFETY_BUFFER_MS = 60_000;

/** Returns true if the token has expired or will expire within SAFETY_BUFFER_MS. */
export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < SAFETY_BUFFER_MS;
}

/**
 * Returns a valid access token, refreshing if necessary.
 * Returns null if no token is stored or refresh fails.
 *
 * NOTE: GIS token client uses prompt='' for silent refresh. If the user
 * revoked access, this returns null (does not throw).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const stored = await tokensRepo.get();
  if (!stored) return null;

  if (!isTokenExpired(stored.expiresAt)) {
    return stored.accessToken;
  }

  // Try silent refresh via GIS (prompt='' — no UI if already consented).
  try {
    const fresh = await requestCalendarTokensSilent();
    await tokensRepo.save({
      id: 'google',
      accessToken: fresh.accessToken,
      refreshToken: stored.refreshToken ?? fresh.refreshToken,
      expiresAt: fresh.expiresAt,
    });
    return fresh.accessToken;
  } catch {
    return null;
  }
}

/**
 * Wave 4 fallback: re-runs the user-facing consent flow when the access
 * token has expired. True silent refresh (GIS with `prompt: ''`) is a
 * Wave 5 polish item; this may surface a popup to the user mid-session.
 */
async function requestCalendarTokensSilent() {
  return requestCalendarTokens();
}

/** Test helper — clears any in-module cache state. */
export function resetTokenStoreForTesting(): void {
  // No mutable state currently cached in-module; reserved for Wave 5
  // when the silent GIS client is created lazily and reused.
}
