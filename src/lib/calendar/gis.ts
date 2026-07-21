'use client';

import { GOOGLE_OAUTH_CLIENT_ID } from '@/lib/env';
import type { GoogleTokenSet } from './types';

const GIS_SCRIPT_ID = 'chrono-kata-gis-script';
const GIS_URL = 'https://accounts.google.com/gsi/client';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let scriptLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('GIS can only be used in the browser'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById(GIS_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load GIS')));
      return;
    }
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: unknown) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'none' }) => void };
        };
      };
    };
  }
}

/**
 * Request an access token from GIS. Returns tokens that the caller MUST
 * persist (including the refresh_token if granted — typically only on first consent).
 *
 * Wave 4 uses `prompt: 'consent'` so the user sees the consent screen every time.
 * Silent refresh with `prompt: ''` is a Wave 5 polish item.
 */
export async function requestCalendarTokens(): Promise<GoogleTokenSet> {
  const clientId = GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error('Calendar feature disabled — NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID not set.');
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('GIS OAuth2 not available');

  return new Promise<GoogleTokenSet>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`OAuth error: ${response.error_description ?? response.error}`));
          return;
        }
        if (!response.access_token) {
          reject(new Error('OAuth: no access token in response'));
          return;
        }
        const expiresInSec = response.expires_in ?? 3600;
        resolve({
          accessToken: response.access_token,
          expiresAt: new Date(Date.now() + expiresInSec * 1000),
          scope: response.scope ?? SCOPE,
        });
      },
      error_callback: (err) => {
        reject(new Error(`OAuth flow failed: ${String(err)}`));
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Request a token silently using `prompt: ''`. Returns null if the user is
 * not reachable silently (revoked access, expired cookies, third-party
 * cookies blocked, etc.) — does not throw. The caller falls back to
 * "no token" which surfaces as a normal signed-out state.
 *
 * Wave 5 polish: avoids popping the consent UI on every refresh.
 */
export async function requestCalendarTokensSilent(): Promise<GoogleTokenSet | null> {
  const clientId = GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  try {
    await loadGisScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return null;

    return await new Promise<GoogleTokenSet | null>((resolve) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            resolve(null);
            return;
          }
          const expiresInSec = response.expires_in ?? 3600;
          resolve({
            accessToken: response.access_token,
            expiresAt: new Date(Date.now() + expiresInSec * 1000),
            scope: response.scope ?? SCOPE,
          });
        },
        error_callback: () => resolve(null),
      });
      client.requestAccessToken({ prompt: '' });
    });
  } catch {
    return null;
  }
}
