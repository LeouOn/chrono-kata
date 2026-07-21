import { tokensRepo } from '@/lib/db/tokens.repo';
import { requestCalendarTokensSilent } from './gis';

const SAFETY_BUFFER_MS = 60_000;

/** Returns true if the token has expired or will expire within SAFETY_BUFFER_MS. */
export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < SAFETY_BUFFER_MS;
}

/**
 * Returns a valid access token, refreshing silently if necessary.
 * Returns null if no token is stored or silent refresh fails.
 *
 * Wave 5: GIS token client with `prompt: ''`. If the user revoked access
 * or third-party cookies are blocked, silent refresh returns null and
 * the caller sees the normal signed-out state — no UI popup.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const stored = await tokensRepo.get();
  if (!stored) return null;

  if (!isTokenExpired(stored.expiresAt)) {
    return stored.accessToken;
  }

  // Silent refresh — no popup. Returns null if it fails.
  const fresh = await requestCalendarTokensSilent();
  if (!fresh) return null;

  await tokensRepo.save({
    id: 'google',
    accessToken: fresh.accessToken,
    refreshToken: stored.refreshToken ?? fresh.refreshToken,
    expiresAt: fresh.expiresAt,
  });
  return fresh.accessToken;
}

/** Test helper — reserved hook for any future in-module caching. */
export function resetTokenStoreForTesting(): void {
  // No-op. Reserved for future use if the silent client is ever cached.
}
