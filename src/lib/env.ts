/**
 * Google OAuth client ID for Calendar sync. Optional — feature is disabled
 * gracefully when not set.
 */
export const GOOGLE_OAUTH_CLIENT_ID: string | null =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || null;

export function isCalendarEnabled(): boolean {
  return GOOGLE_OAUTH_CLIENT_ID !== null;
}
