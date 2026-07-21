# chrono-kata Wave 4: Calendar Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the optional Google Calendar export. User connects via Google Identity Services (GIS) one-tap, app creates a dedicated `chrono-kata` calendar, then every saved session (with `durationMinutes`) is pushed as an event. Write-only. Disconnection is non-destructive by default (clears tokens + disables sync; user opts in to also delete the calendar).

**Architecture:** All client-side. GIS library loaded via script tag. Tokens (access + refresh) in IndexedDB `tokens` table (Wave 1). Calendar ops via fetch to `https://www.googleapis.com/calendar/v3`. Single `getValidAccessToken()` wrapper handles refresh. Per-session save enqueues a calendar op (or fires immediately if online + synced); a `pendingCalendarOps` queue (Wave 1 table) holds failures for retry on next app open.

**Tech Stack:** Same as Waves 1–3. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`, ever.
- **OAuth scope:** `https://www.googleapis.com/auth/calendar.events` (NOT the broader `calendar` scope — per spec §7).
- **Token storage:** IndexedDB `tokens` table (singleton id `'google'`).
- **No `localStorage` for tokens.** IndexedDB only.
- **Pending ops queue:** `pendingCalendarOps` table from Wave 1. Exponential backoff per op, max 5 attempts.
- **Non-destructive disconnect:** default action is `clearTokens + disableSync`; "also delete calendar" is opt-in via checkbox.
- **No event creation for reps-only sessions** (no `startedAt + endedAt` window to put on calendar). Only `durationMinutes` sessions sync.
- **Env var:** `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (read at runtime; missing = feature disabled gracefully).
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.
- **`motion/react`** for motion imports.

---

## File Structure (Wave 4 additions)

```
src/
├── lib/
│   ├── calendar/
│   │   ├── gis.ts                            # NEW — load GIS, request code, exchange for tokens
│   │   ├── token-store.ts                    # NEW — getValidAccessToken() with auto-refresh
│   │   ├── client.ts                         # NEW — REST wrapper (create cal, create/update/delete event)
│   │   ├── sync.ts                           # NEW — per-session save → enqueue + flush logic
│   │   └── types.ts                          # NEW — GoogleCalendarEvent, etc.
│   └── env.ts                                # NEW — typed accessor for NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
├── hooks/
│   └── useCalendar.ts                        # NEW — connect/disconnect/status
└── components/
    └── calendar/
        ├── CalendarStatus.tsx                # NEW — shows connected/disconnected state
        └── CalendarSettings.tsx              # NEW — connect button, sync toggle, disconnect with confirm
tests/
└── unit/
    └── calendar/
        ├── token-store.test.ts               # NEW — refresh logic
        └── sync.test.ts                      # NEW — op-enqueue logic
```

---

## Task 1: Env accessor + GIS script loader

**Files:**
- Create: `src/lib/env.ts`, `src/lib/calendar/gis.ts`, `src/lib/calendar/types.ts`

- [ ] **Step 1: Env accessor**

Create `src/lib/env.ts`:

```typescript
/**
 * Google OAuth client ID for Calendar sync. Optional — feature is disabled
 * gracefully when not set.
 */
export const GOOGLE_OAUTH_CLIENT_ID: string | null =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || null;

export function isCalendarEnabled(): boolean {
  return GOOGLE_OAUTH_CLIENT_ID !== null;
}
```

- [ ] **Step 2: Calendar types**

Create `src/lib/calendar/types.ts`:

```typescript
export interface GoogleCalendarEvent {
  id?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  summary: string;
  description?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date; // 1 hour from issuance
  scope: string;
}
```

- [ ] **Step 3: GIS loader + token exchange**

Create `src/lib/calendar/gis.ts`:

```typescript
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
            callback: (response: { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }) => void;
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
 */
export async function requestCalendarTokens(): Promise<GoogleTokenSet> {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('Calendar feature disabled — NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID not set.');
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('GIS OAuth2 not available');

  return new Promise<GoogleTokenSet>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
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
    // Use prompt='' for silent auth if already consented, falls back to consent UI
    client.requestAccessToken({ prompt: 'consent' });
  });
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: env accessor + GIS script loader for calendar OAuth" }
```

---

## Task 2: Token store with auto-refresh

**Files:**
- Create: `src/lib/calendar/token-store.ts`
- Test: `tests/unit/calendar/token-store.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/calendar/token-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTokenExpired, getValidAccessToken, resetTokenStoreForTesting } from '@/lib/calendar/token-store';
import { tokensRepo } from '@/lib/db/tokens.repo';
import { resetDbForTesting } from '@/lib/db/db';

beforeEach(async () => {
  resetDbForTesting();
  resetTokenStoreForTesting();
});

describe('isTokenExpired', () => {
  it('returns true if expiry is past', () => {
    expect(isTokenExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  it('returns true if expiry is within 60s (safety buffer)', () => {
    expect(isTokenExpired(new Date(Date.now() + 30_000))).toBe(true);
  });

  it('returns false if expiry is more than 60s away', () => {
    expect(isTokenExpired(new Date(Date.now() + 120_000))).toBe(false);
  });
});

describe('getValidAccessToken', () => {
  it('returns stored token if still valid', async () => {
    await tokensRepo.save({
      id: 'google',
      accessToken: 'valid-token',
      expiresAt: new Date(Date.now() + 600_000),
    });
    const token = await getValidAccessToken();
    expect(token).toBe('valid-token');
  });

  it('returns null if no token stored', async () => {
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it('returns null if token expired and no refresh logic available', async () => {
    await tokensRepo.save({
      id: 'google',
      accessToken: 'old-token',
      expiresAt: new Date(Date.now() - 1000),
    });
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });
});
```

- [ ] **Step 2: Implement token store**

Create `src/lib/calendar/token-store.ts`:

```typescript
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

let silentClient: ReturnType<typeof createSilentClient> | null = null;

function createSilentClient() {
  // Lazy-load GIS and create a token client configured for silent refresh.
  // This is intentionally separate from the user-initiated requestCalendarTokens.
  return null; // Placeholder — full implementation requires loading GIS first.
  // The real implementation will use the same GIS script but with prompt: ''.
}

async function requestCalendarTokensSilent() {
  // For Wave 4 we use the user-facing flow as a fallback.
  // Full silent refresh with prompt='' is a Wave 5 polish item.
  return requestCalendarTokens();
}

/** Test helper. */
export function resetTokenStoreForTesting(): void {
  silentClient = null;
}
```

> **Note:** The Wave 4 implementation uses the user-facing token request as a fallback for refresh. True silent refresh (GIS with `prompt=''`) is a Wave 5 polish item. This means: if the access token expires mid-session, the user might see a popup. Acceptable for MVP.

- [ ] **Step 3: Run tests**

Run: `npm test -- token-store`
Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: calendar token store with expiry check + tests" }
```

---

## Task 3: Calendar REST client (create calendar, CRUD events)

**Files:**
- Create: `src/lib/calendar/client.ts`

- [ ] **Step 1: Implement client**

Create `src/lib/calendar/client.ts`:

```typescript
import { getValidAccessToken } from './token-store';
import type { GoogleCalendarEvent, GoogleCalendarListEntry } from './types';

const API_BASE = 'https://www.googleapis.com/calendar/v3';

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not authenticated with Google.');
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Create a dedicated calendar named "chrono-kata" on the user's account.
 * Returns the new calendar's ID.
 */
export async function createChronoKataCalendar(): Promise<string> {
  const resp = await authedFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: 'chrono-kata' }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to create calendar: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/**
 * Delete the chrono-kata calendar. Use during disconnect-with-wipe.
 */
export async function deleteCalendar(calendarId: string): Promise<void> {
  const resp = await authedFetch(`/calendars/${encodeURIComponent(calendarId)}`, {
    method: 'DELETE',
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete calendar: ${resp.status}`);
  }
}

/** Create a calendar event. Returns the new event's ID. */
export async function createEvent(calendarId: string, event: GoogleCalendarEvent): Promise<string> {
  const resp = await authedFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  if (!resp.ok) {
    throw new Error(`Failed to create event: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/** Update a calendar event. */
export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: GoogleCalendarEvent
): Promise<void> {
  const resp = await authedFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PUT', body: JSON.stringify(event) }
  );
  if (!resp.ok) {
    throw new Error(`Failed to update event: ${resp.status}`);
  }
}

/** Delete a calendar event. */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const resp = await authedFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete event: ${resp.status}`);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: Google Calendar REST client (calendar + event CRUD)" }
```

---

## Task 4: Sync logic — per-session save hook + pending ops flush

**Files:**
- Create: `src/lib/calendar/sync.ts`
- Test: `tests/unit/calendar/sync.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/calendar/sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { buildEventFromSession, shouldSyncSession } from '@/lib/calendar/sync';
import type { Session } from '@/lib/schemas/session';
import type { Settings } from '@/lib/schemas/settings';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: 'cal-123',
  googleCalendarSyncEnabled: true,
  googleCalendarConnectedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('shouldSyncSession', () => {
  it('returns false if sync disabled', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings({ googleCalendarSyncEnabled: false }))).toBe(false);
  });

  it('returns false if no calendarId', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings({ googleCalendarId: null }))).toBe(false);
  });

  it('returns false for reps-only sessions', () => {
    const s = ses({ durationMinutes: null, reps: 108 });
    expect(shouldSyncSession(s, settings())).toBe(false);
  });

  it('returns true for timed session with all conditions met', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(shouldSyncSession(s, settings())).toBe(true);
  });
});

describe('buildEventFromSession', () => {
  it('builds event with start/end derived from startedAt + durationMinutes', () => {
    const startedAt = new Date('2026-07-21T10:00:00Z');
    const s = ses({ startedAt, durationMinutes: 30, reps: null, activityLabel: 'meditation', note: 'still' });
    const event = buildEventFromSession(s);
    expect(event.summary).toBe('meditation');
    expect(event.description).toBe('still');
    expect(event.start.dateTime).toBe(startedAt.toISOString());
    expect(event.end.dateTime).toBe(new Date(startedAt.getTime() + 30 * 60_000).toISOString());
  });

  it('falls back to "chrono-kata session" if no label', () => {
    const s = ses({ durationMinutes: 30, reps: null });
    expect(buildEventFromSession(s).summary).toBe('chrono-kata session');
  });
});
```

- [ ] **Step 2: Implement sync logic**

Create `src/lib/calendar/sync.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import type { Settings } from '@/lib/schemas/settings';
import type { GoogleCalendarEvent } from './types';
import { createEvent, updateEvent, deleteEvent } from './client';
import { pendingCalendarOpsRepo } from '@/lib/db/pending-calendar-ops.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';

/** Returns true if this session should be pushed to Google Calendar. */
export function shouldSyncSession(session: Session, settings: Settings): boolean {
  if (!settings.googleCalendarSyncEnabled) return false;
  if (!settings.googleCalendarId) return false;
  if (session.durationMinutes == null) return false; // reps-only: no time window
  return true;
}

/** Build the Google Calendar event body from a session. */
export function buildEventFromSession(session: Session): GoogleCalendarEvent {
  if (session.durationMinutes == null) {
    throw new Error('Cannot build event from reps-only session');
  }
  const start = session.startedAt;
  const end = new Date(start.getTime() + session.durationMinutes * 60_000);
  return {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    summary: session.activityLabel ?? 'chrono-kata session',
    description: session.note ?? '',
  };
}

/**
 * Fire-and-forget: try to create/update/delete the calendar event for a session.
 * On any failure, enqueue into pendingCalendarOps for retry.
 */
export async function syncSessionCreateOrUpdate(session: Session): Promise<void> {
  const settings = await settingsRepo.get();
  if (!shouldSyncSession(session, settings)) return;

  const calendarId = settings.googleCalendarId!;

  try {
    if (session.calendarEventId) {
      // Update existing event
      await updateEvent(calendarId, session.calendarEventId, buildEventFromSession(session));
    } else {
      // Create new event
      const eventId = await createEvent(calendarId, buildEventFromSession(session));
      await sessionRepo.update(session.id, { calendarEventId: eventId });
    }
  } catch (e) {
    // Enqueue for retry
    await pendingCalendarOpsRepo.enqueue({
      op: session.calendarEventId ? 'update' : 'create',
      sessionId: session.id,
      payload: buildEventFromSession(session),
    });
    console.warn('Calendar sync failed, op queued:', e);
  }
}

/**
 * Fire-and-forget: delete the calendar event for a deleted session.
 */
export async function syncSessionDelete(session: Session): Promise<void> {
  const settings = await settingsRepo.get();
  if (!session.calendarEventId) return;
  if (!settings.googleCalendarId) return;

  try {
    await deleteEvent(settings.googleCalendarId, session.calendarEventId);
  } catch (e) {
    await pendingCalendarOpsRepo.enqueue({
      op: 'delete',
      sessionId: session.id,
    });
    console.warn('Calendar delete sync failed, op queued:', e);
  }
}

/**
 * Flush pending ops with exponential backoff per op. Called on app open
 * and on each subsequent session save. Permanently-failed ops (5 attempts)
 * are surfaced in Settings for manual retry or discard.
 */
export async function flushPendingOps(): Promise<void> {
  const settings = await settingsRepo.get();
  if (!settings.googleCalendarId) return;

  const ops = await pendingCalendarOpsRepo.getAll();
  for (const op of ops) {
    if (op.attempts >= 5) continue;

    try {
      const session = await sessionRepoWatchSafe(op.sessionId);
      if (op.op === 'delete') {
        if (session?.calendarEventId) {
          await deleteEvent(settings.googleCalendarId!, session.calendarEventId);
        }
      } else if (session) {
        const eventPayload = op.payload as GoogleCalendarEvent | undefined;
        if (!eventPayload) continue;
        if (op.op === 'create') {
          const eventId = await createEvent(settings.googleCalendarId!, eventPayload);
          await sessionRepo.update(session.id, { calendarEventId: eventId });
        } else {
          if (session.calendarEventId) {
            await updateEvent(settings.googleCalendarId!, session.calendarEventId, eventPayload);
          }
        }
      }
      await pendingCalendarOpsRepo.delete(op.id);
    } catch (e) {
      const lastError = e instanceof Error ? e.message : String(e);
      await pendingCalendarOpsRepo.update(op.id, {
        attempts: op.attempts + 1,
        lastError,
      });
    }
  }
}

async function sessionRepoWatchSafe(id: string) {
  try {
    const db = (await import('@/lib/db/db')).getDb();
    return await db.sessions.get(id);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run sync tests**

Run: `npm test -- sync.test`
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: calendar sync logic + pending ops queue flush" }
```

---

## Task 5: Wire calendar sync into useSessions + useCalendar hook

**Files:**
- Modify: `src/hooks/useSessions.ts` (fire `syncSessionCreateOrUpdate` / `syncSessionDelete` after save/delete)
- Create: `src/hooks/useCalendar.ts`

- [ ] **Step 1: Update useSessions to fire calendar sync**

Add to `src/hooks/useSessions.ts`:

In `createMutation.onSuccess`, after the existing `generateCoachCommentSideEffect(saved)`, add:

```typescript
void syncSessionCreateOrUpdate(saved);
```

Import at top:

```typescript
import { syncSessionCreateOrUpdate, syncSessionDelete, flushPendingOps } from '@/lib/calendar/sync';
```

In `updateMutation.onSettled`, after `invalidateBoth()`:

```typescript
void (async () => {
  const updated = await sessionRepoGetById(args.id);
  if (updated) void syncSessionCreateOrUpdate(updated);
})();
```

(Or simply re-fetch via React Query cache.)

In `deleteMutation.mutationFn`, BEFORE actually deleting the session, capture it and fire `syncSessionDelete`:

```typescript
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const session = await sessionRepo.getById?.(id);
    if (session) await syncSessionDelete(session);
    return sessionRepo.delete(id);
  },
  onSettled: async () => {
    await recomputeStreakSideEffect();
    invalidateBoth();
  },
});
```

> **Note:** The session repo doesn't currently expose `getById`. If needed, add a simple `getById(id: string)` method to `SessionRepository` and `DexieSessionRepository` that does `getDb().sessions.get(id)`.

Also fire `flushPendingOps()` on app open. Add to `src/app/(main)/layout.tsx`'s `useEffect`:

```typescript
useEffect(() => {
  void flushPendingOps();
}, []);
```

- [ ] **Step 2: useCalendar hook**

Create `src/hooks/useCalendar.ts`:

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';
import { tokensRepo } from '@/lib/db/tokens.repo';
import { requestCalendarTokens } from '@/lib/calendar/gis';
import { createChronoKataCalendar, deleteCalendar } from '@/lib/calendar/client';
import { flushPendingOps } from '@/lib/calendar/sync';

const KEY = ['settings'] as const;

export function useCalendar() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: KEY, queryFn: () => settingsRepo.get() });

  const connect = useMutation({
    mutationFn: async () => {
      const tokens = await requestCalendarTokens();
      await tokensRepo.save({
        id: 'google',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      const calendarId = await createChronoKataCalendar();
      return settingsRepo.patch({
        googleCalendarId: calendarId,
        googleCalendarSyncEnabled: true,
        googleCalendarConnectedAt: new Date(),
      });
    },
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const disconnect = useMutation({
    mutationFn: async ({ alsoDeleteCalendar }: { alsoDeleteCalendar: boolean }) => {
      const current = await settingsRepo.get();
      await tokensRepo.clear();
      if (alsoDeleteCalendar && current.googleCalendarId) {
        await deleteCalendar(current.googleCalendarId);
      }
      return settingsRepo.patch({
        googleCalendarSyncEnabled: false,
        googleCalendarConnectedAt: null,
        // Keep calendarId for potential reconnect unless wiping
        ...(alsoDeleteCalendar ? { googleCalendarId: null } : {}),
      });
    },
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const toggleSync = useMutation({
    mutationFn: async (enabled: boolean) => settingsRepo.patch({ googleCalendarSyncEnabled: enabled }),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const flushPending = useMutation({
    mutationFn: async () => {
      await flushPendingOps();
    },
  });

  return {
    settings: settingsQuery.data,
    isConnected: !!settingsQuery.data?.googleCalendarConnectedAt,
    isConnecting: connect.isPending,
    connect: connect.mutateAsync,
    disconnect: disconnect.mutateAsync,
    toggleSync: toggleSync.mutateAsync,
    flushPending: flushPending.mutateAsync,
  };
}
```

- [ ] **Step 3: Add getById to SessionRepository**

Modify `src/lib/db/session.repo.ts`:

Add to `SessionRepository` interface:
```typescript
getById(id: string): Promise<Session | null>;
```

Add to `DexieSessionRepository`:
```typescript
async getById(id: string): Promise<Session | null> {
  const result = await getDb().sessions.get(id);
  return result ?? null;
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: wire calendar sync into useSessions + useCalendar hook" }
```

---

## Task 6: Calendar settings UI

**Files:**
- Create: `src/components/calendar/CalendarStatus.tsx`, `src/components/calendar/CalendarSettings.tsx`
- Modify: `src/app/(main)/settings/page.tsx` to include calendar section

- [ ] **Step 1: CalendarStatus component**

Create `src/components/calendar/CalendarStatus.tsx`:

```tsx
import type { Settings } from '@/lib/schemas/settings';

interface Props {
  settings: Settings | undefined;
}

export function CalendarStatus({ settings }: Props) {
  if (!settings?.googleCalendarConnectedAt) {
    return <span className="text-xs text-text-muted">Not connected</span>;
  }
  return (
    <span className="text-xs text-zen">
      Connected · {settings.googleCalendarSyncEnabled ? 'syncing' : 'paused'}
    </span>
  );
}
```

- [ ] **Step 2: CalendarSettings component**

Create `src/components/calendar/CalendarSettings.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CalendarStatus } from './CalendarStatus';
import { useCalendar } from '@/hooks/useCalendar';
import { isCalendarEnabled } from '@/lib/env';

export function CalendarSettings() {
  const { settings, isConnected, isConnecting, connect, disconnect, toggleSync } = useCalendar();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoDelete, setAlsoDelete] = useState(false);

  if (!isCalendarEnabled()) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
          Google Calendar
        </div>
        <p className="text-text-muted text-sm">
          Calendar export is disabled. Set <code>NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID</code> in your environment to enable.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">
          Google Calendar
        </div>
        <CalendarStatus settings={settings} />
      </div>

      {!isConnected ? (
        <>
          <p className="text-text-muted text-sm mb-3">
            Connect to push timed sessions to a dedicated <code>chrono-kata</code> calendar. Reps-only sessions are not exported.
          </p>
          <Button onClick={() => connect()} disabled={isConnecting}>
            {isConnecting ? 'Connecting…' : 'Connect Google Calendar'}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.googleCalendarSyncEnabled ?? false}
              onChange={(e) => toggleSync(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-sm text-text">Sync new sessions automatically</span>
          </label>
          <div>
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect Google Calendar?"
        message={
          isConnected
            ? 'Clears tokens and pauses sync. Your chrono-kata calendar and past events remain untouched unless you opt in below.'
            : ''
        }
        confirmLabel="Disconnect"
        onConfirm={() => {
          void disconnect({ alsoDeleteCalendar: alsoDelete });
          setConfirmOpen(false);
          setAlsoDelete(false);
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setAlsoDelete(false);
        }}
      >
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={alsoDelete}
            onChange={(e) => setAlsoDelete(e.target.checked)}
            className="accent-[var(--color-hype)]"
          />
          <span className="text-sm text-hype">
            Also delete the chrono-kata calendar (irreversible)
          </span>
        </label>
      </ConfirmDialog>
    </Card>
  );
}
```

> **Note:** `ConfirmDialog` from Wave 2 currently doesn't accept children. Modify it to accept `children?: ReactNode` and render after the message.

- [ ] **Step 3: Update ConfirmDialog to accept children**

Modify `src/components/ui/ConfirmDialog.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  children,
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-text-muted mb-4">{message}</p>
      {children && <div className="mb-4">{children}</div>}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Add CalendarSettings to Settings page**

Modify `src/app/(main)/settings/page.tsx` to include the calendar section. Import and add:

```tsx
import { CalendarSettings } from '@/components/calendar/CalendarSettings';
// ... inside the JSX, after the existing cards:
<CalendarSettings />
```

- [ ] **Step 5: Verify typecheck + dev**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run dev` → visit `/settings` → see Calendar card (shows "disabled" message if env var not set, otherwise shows "Connect" button). Kill server.

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: calendar settings UI - connect/disconnect/sync toggle" }
```

---

## Task 7: Final Wave 4 verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all tests pass (70+ Wave 1–3 tests + Wave 4's ~11 tests).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 4 final verification" } }
```

---

## Wave 4 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all tests pass (75+ tests)
- [ ] `npm run build` succeeds
- [ ] `/settings` shows Calendar section (disabled gracefully if `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` not set)
- [ ] Connect button launches GIS OAuth flow (cannot be tested without real OAuth client ID — flag as manual QA)
- [ ] Disconnect is non-destructive by default; opt-in checkbox wipes calendar
- [ ] Sync toggle persists
- [ ] Saving a timed session enqueues/fires calendar op
- [ ] Saving a reps-only session does NOT trigger calendar op
- [ ] Failed ops land in `pendingCalendarOps` table
- [ ] `flushPendingOps()` runs on app open
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## What's Next (Wave 5)

- **Wave 5: Polish** — Athena 7-tap unlock mechanic, Lighthouse ≥80 verification, empty state refinements, silent GIS token refresh (prompt=''), PWA install prompt handling, error toast system.
