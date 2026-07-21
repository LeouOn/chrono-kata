# chrono-kata Wave 5: Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship the polish layer. Athena secret unlock (7-tap streak flame), silent GIS token refresh, PWA install prompt handling, error toast system, Lighthouse ≥80 verification, final empty-state refinements. After Wave 5, chrono-kata meets the full Wave 1 spec DoD.

**Architecture:** No new subsystems. Small focused additions across existing files. Adds: `useAthenaUnlock` hook for the 7-tap detector, `Toast` primitive + `ToastProvider` for error/confirm notifications, `usePWAInstall` hook for `beforeinstallprompt` handling, silent refresh path in token-store.

**Tech Stack:** Same as Waves 1–4. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`, ever. `as unknown as X` only for forced narrowing from unknown boundaries (document each use).
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.
- **`motion/react`** for motion.
- **Athena unlock trigger:** 7 taps within 5 seconds on `<StreakFlame>`.
- **Silent refresh:** GIS with `prompt: ''` (no UI popup if already consented).
- **PWA install:** defer `beforeinstallprompt` event, show a custom "Install" button in Settings when available.

---

## File Structure (Wave 5 additions)

```
src/
├── components/
│   ├── ui/
│   │   ├── Toast.tsx                        # NEW — toast primitive + provider
│   │   └── PWAInstallPrompt.tsx              # NEW — custom install button
│   ├── streak/
│   │   └── StreakFlame.tsx                   # MODIFY — wire tap detection
│   └── coach/
│       └── AthenaReveal.tsx                  # NEW — celebration when unlocked
├── hooks/
│   ├── useAthenaUnlock.ts                    # NEW — 7-tap detector
│   ├── usePWAInstall.ts                      # NEW — beforeinstallprompt handler
│   └── useToast.ts                           # NEW — toast hook
├── lib/
│   └── calendar/
│       └── token-store.ts                    # MODIFY — add silent refresh path
└── app/
    └── (main)/
        ├── settings/page.tsx                 # MODIFY — add PWA install + Athena reveal info
        └── layout.tsx                        # MODIFY — add ToastProvider
tests/
└── unit/
    └── streak/
        └── useAthenaUnlock.test.ts           # NEW — tap pattern detection
```

---

## Task 1: Toast system

**Files:**
- Create: `src/components/ui/Toast.tsx`, `src/hooks/useToast.ts`
- Modify: `src/app/layout.tsx` (wrap with ToastProvider), `src/app/(main)/layout.tsx` (consume toasts for LLM/calendar errors)

- [ ] **Step 1: ToastProvider + useToast**

Create `src/components/ui/Toast.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

type Variant = 'info' | 'success' | 'error';

interface Toast {
  id: string;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  show: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, variant: Variant = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const variantColors: Record<Variant, string> = {
    info: 'bg-surface border-border text-text',
    success: 'bg-surface border-zen/50 text-zen',
    error: 'bg-surface border-hype/50 text-hype',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg max-w-md ${variantColors[t.variant]}`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastContext must be used within ToastProvider');
  return ctx;
}
```

Create `src/hooks/useToast.ts`:

```typescript
'use client';

import { useToastContext } from '@/components/ui/Toast';

export function useToast() {
  return useToastContext();
}
```

- [ ] **Step 2: Wrap root layout**

Modify `src/app/layout.tsx` — wrap children with `<ToastProvider>`:

```tsx
import { ToastProvider } from '@/components/ui/Toast';
// ... in JSX, wrap QueryProvider:
<QueryProvider>
  <ToastProvider>{children}</ToastProvider>
</QueryProvider>
```

- [ ] **Step 3: Verify typecheck + commit**

Run: `npm run typecheck`
Expected: exit 0.

```powershell
git add .; if ($?) { git commit -m "feat: toast system with info/success/error variants" }
```

---

## Task 2: Athena 7-tap unlock + reveal

**Files:**
- Create: `src/hooks/useAthenaUnlock.ts`, `src/components/coach/AthenaReveal.tsx`
- Modify: `src/components/streak/StreakFlame.tsx` (wire tap detection), `src/lib/coaches/index.ts` (no change — registry already includes Athena)

- [ ] **Step 1: useAthenaUnlock hook**

Create `src/hooks/useAthenaUnlock.ts`:

```typescript
'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';

const REQUIRED_TAPS = 7;
const WINDOW_MS = 5000;

interface Options {
  onUnlock?: () => void;
}

/**
 * Tracks rapid taps. Returns a `registerTap` function that the consumer calls
 * on each tap; triggers unlock when REQUIRED_TAPS accumulate within WINDOW_MS.
 */
export function useAthenaUnlock({ onUnlock }: Options = {}) {
  const tapsRef = useRef<number[]>([]);
  const qc = useQueryClient();

  const registerTap = useCallback(async () => {
    const now = Date.now();
    // Prune old taps.
    tapsRef.current = tapsRef.current.filter((t) => now - t < WINDOW_MS);
    tapsRef.current.push(now);

    if (tapsRef.current.length >= REQUIRED_TAPS) {
      tapsRef.current = [];
      // Read current settings, check if already unlocked.
      const current = await settingsRepo.get();
      if (current.unlockedPersonalities.includes('athena')) {
        return; // already unlocked
      }
      await settingsRepo.patch({
        unlockedPersonalities: [...current.unlockedPersonalities, 'athena'],
      });
      qc.invalidateQueries({ queryKey: ['settings'] });
      onUnlock?.();
    }
  }, [onUnlock, qc]);

  return { registerTap };
}
```

- [ ] **Step 2: AthenaReveal component**

Create `src/components/coach/AthenaReveal.tsx`:

```tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AthenaReveal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-base/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18 }}
            className="text-center px-8 max-w-sm"
            style={{
              background: 'linear-gradient(135deg, var(--color-athena-from), var(--color-athena-to))',
              '-webkit-background-clip': 'text',
              'background-clip': 'text',
              color: 'transparent',
            }}
          >
            <div className="text-6xl mb-4">✦</div>
            <h2 className="font-serif text-3xl mb-3" style={{ color: 'var(--color-text)' }}>
              Athena Prajñāpāramitā
            </h2>
            <p className="text-text-muted text-sm" style={{ color: 'var(--color-text-muted)' }}>
              A new voice is available in your coach picker.
              <br />
              Tap anywhere to continue.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Wire StreakFlame to detect taps**

Modify `src/components/streak/StreakFlame.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { useAthenaUnlock } from '@/hooks/useAthenaUnlock';
import { AthenaReveal } from '@/components/coach/AthenaReveal';

interface Props {
  days: number;
}

export function StreakFlame({ days }: Props) {
  const [revealOpen, setRevealOpen] = useState(false);
  const { registerTap } = useAthenaUnlock({
    onUnlock: () => setRevealOpen(true),
  });

  return (
    <>
      <motion.button
        onClick={() => registerTap()}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3"
        aria-label={`${days} day streak`}
      >
        <span className="text-2xl" role="img" aria-hidden>🔥</span>
        <div className="text-left">
          <div className="font-serif text-2xl text-accent leading-none">{days}</div>
          <div className="text-xs text-text-muted">day streak</div>
        </div>
      </motion.button>
      <AthenaReveal open={revealOpen} onClose={() => setRevealOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Update PersonalityPicker to include Athena if unlocked**

Modify `src/components/onboarding/PersonalityPicker.tsx` (or the settings personality selector) to include Athena card when `unlockedPersonalities` includes 'athena'. The Wave 1 PersonalityPicker uses `STANDARD_COACH_PERSONALITIES` (4 only). Need to filter from settings.

In Settings page where personality buttons appear, also add Athena if unlocked:

```tsx
const availablePersonalities = settings?.unlockedPersonalities ?? ['zen', 'hype', 'analyst', 'buddy'];
// Render buttons from availablePersonalities
```

Update the Settings page personality selector:

```tsx
<div className="flex gap-2 flex-wrap">
  {(settings?.unlockedPersonalities ?? ['zen', 'hype', 'analyst', 'buddy']).map((p) => (
    <Button
      key={p}
      variant={settings?.selectedCoachPersonality === p ? 'primary' : 'ghost'}
      onClick={() => updateSettings({ selectedCoachPersonality: p })}
    >
      {p}{p === 'athena' ? ' ✦' : ''}
    </Button>
  ))}
</div>
```

- [ ] **Step 5: Verify typecheck + commit**

Run: `npm run typecheck`
Expected: exit 0.

```powershell
git add .; if ($?) { git commit -m "feat: Athena 7-tap unlock + reveal + personality picker integration" }
```

---

## Task 3: Silent GIS token refresh + LLM/calendar error toasts

**Files:**
- Modify: `src/lib/calendar/token-store.ts` (silent refresh path), `src/lib/calendar/gis.ts` (add silent request function)
- Modify: `src/hooks/useSessions.ts` (toast on LLM failure), `src/hooks/useCalendar.ts` (toast on connect/disconnect)

- [ ] **Step 1: Add silent token request to GIS**

Modify `src/lib/calendar/gis.ts` — add new export:

```typescript
/**
 * Request a token silently using prompt=''. Returns null if user is not
 * reachable silently (revoked access, expired cookies, etc.) — does not throw.
 */
export async function requestCalendarTokensSilent(): Promise<GoogleTokenSet | null> {
  if (!GOOGLE_OAUTH_CLIENT_ID) return null;
  try {
    await loadGisScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return null;

    return await new Promise<GoogleTokenSet | null>((resolve) => {
      const client = oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
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
```

- [ ] **Step 2: Update token-store to use silent refresh**

Modify `src/lib/calendar/token-store.ts`:

```typescript
import { tokensRepo } from '@/lib/db/tokens.repo';
import { requestCalendarTokensSilent } from './gis';  // changed import

const SAFETY_BUFFER_MS = 60_000;

export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < SAFETY_BUFFER_MS;
}

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

export function resetTokenStoreForTesting(): void {
  // No-op now that we removed silentClient scaffolding.
}
```

Update `tests/unit/calendar/token-store.test.ts` to mock `requestCalendarTokensSilent`:

```typescript
import { vi } from 'vitest';
vi.mock('@/lib/calendar/gis', () => ({
  requestCalendarTokens: vi.fn(),
  requestCalendarTokensSilent: vi.fn().mockResolvedValue(null),
}));
```

- [ ] **Step 3: Toast on LLM failure in useSessions**

Modify `src/hooks/useSessions.ts` — change `generateCoachCommentSideEffect` to surface a toast on hard failures. Add at top of file:

```typescript
// Can't import useToast here (hooks can't use hooks at module scope).
// Instead, dispatch a CustomEvent that the ToastProvider listens for.
function dispatchToast(message: string, variant: 'info' | 'success' | 'error' = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('chrono-kata-toast', { detail: { message, variant } }));
}
```

In the catch block of `generateCoachCommentSideEffect`, add `dispatchToast(errorMessage, 'error')` for non-offline errors.

- [ ] **Step 4: Wire ToastProvider to listen for CustomEvent**

Modify `src/components/ui/Toast.tsx` — add a `useEffect` in ToastProvider that listens for `chrono-kata-toast` events:

```typescript
import { useEffect } from 'react';
// ... inside ToastProvider:
useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { message: string; variant: Variant };
    show(detail.message, detail.variant);
  };
  window.addEventListener('chrono-kata-toast', handler);
  return () => window.removeEventListener('chrono-kata-toast', handler);
}, [show]);
```

- [ ] **Step 5: Verify typecheck + tests**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test -- token-store`
Expected: still passing (silent refresh mocked to return null = same behavior as before).

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: silent GIS refresh + LLM/calendar error toasts" }
```

---

## Task 4: PWA install prompt

**Files:**
- Create: `src/hooks/usePWAInstall.ts`, `src/components/ui/PWAInstallPrompt.tsx`
- Modify: `src/app/(main)/settings/page.tsx` to show install button when available

- [ ] **Step 1: usePWAInstall hook**

Create `src/hooks/usePWAInstall.ts`:

```typescript
'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already installed?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault(); // prevent default browser prompt
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return {
    canInstall: !!deferredPrompt && !installed,
    installed,
    promptInstall,
  };
}
```

- [ ] **Step 2: PWAInstallPrompt component**

Create `src/components/ui/PWAInstallPrompt.tsx`:

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallPrompt() {
  const { canInstall, installed, promptInstall } = usePWAInstall();

  if (installed) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
          Installation
        </div>
        <div className="text-zen text-sm">✓ Installed as PWA</div>
      </Card>
    );
  }

  if (!canInstall) {
    return null; // hide entirely if neither installable nor installed
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
        Installation
      </div>
      <p className="text-text-muted text-sm mb-3">
        Install chrono-kata on your device for a full-screen, app-like experience.
      </p>
      <Button onClick={promptInstall}>Install app</Button>
    </Card>
  );
}
```

- [ ] **Step 3: Add to Settings page**

Modify `src/app/(main)/settings/page.tsx` to include `<PWAInstallPrompt />` near the top.

- [ ] **Step 4: Verify typecheck + commit**

Run: `npm run typecheck`
Expected: exit 0.

```powershell
git add .; if ($?) { git commit -m "feat: PWA install prompt in Settings" }
```

---

## Task 5: Final polish — empty states, copy refinements, Lighthouse check

**Files:**
- Modify: empty-state copy in `src/app/(main)/page.tsx` (Home) and `src/app/(main)/sessions/page.tsx` and `src/app/(main)/reflect/page.tsx`
- Modify: `public/manifest.webmanifest` (ensure `display: 'standalone'`, `orientation: 'portrait'`)

- [ ] **Step 1: Refine empty-state copy**

Each tab's empty state should have a coach-personality-flavored one-liner. For Wave 5, hardcode Zen voice (default personality) for simplicity — per-personality empty states are out of scope.

Update Home empty state in `src/app/(main)/page.tsx`:

Current: `"No sessions yet. The first step is the whole path."`

Keep this — it's already good Zen-flavored copy.

Update Sessions empty state in `src/app/(main)/sessions/page.tsx`:

```tsx
<p className="text-text-muted text-sm text-center py-12 italic">
  No sessions logged yet. The first one is the hardest — and the simplest.
</p>
```

Update Reflect empty state in `src/app/(main)/reflect/page.tsx`:

```tsx
<p className="text-text-muted text-sm">
  No reflections yet. After a week of practice, generate one to see your patterns mirrored back.
</p>
```

- [ ] **Step 2: Ensure manifest is correct**

Verify `public/manifest.webmanifest` has:
- `"display": "standalone"`
- `"orientation": "portrait"`
- `"start_url": "/"`
- icons include maskable variants
- `"theme_color"` and `"background_color"` are `#0f0e0c`

If anything is missing, fix it.

- [ ] **Step 3: Lighthouse check (manual)**

Run: `npm run build && npm run start`
Visit http://localhost:3000 in Chrome → DevTools → Lighthouse → Mobile → Run.

Expected: Performance ≥ 80, PWA compliant, Accessibility ≥ 90.

If Performance < 80, identify the biggest issue (likely bundle size or font loading). Document findings but don't fix in this task — fixes are out of Wave 5 scope unless trivial.

Kill the production server.

- [ ] **Step 4: Commit final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 5 empty-state refinement + manifest verification" } }
```

---

## Wave 5 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all tests pass (82+ tests; Wave 5 doesn't add many new tests but doesn't break existing)
- [ ] `npm run build` succeeds
- [ ] Tapping streak flame 7 times within 5 seconds unlocks Athena + shows reveal modal
- [ ] Athena card appears in personality picker after unlock (Settings)
- [ ] Athena can be selected as active coach personality
- [ ] Toast notifications appear for LLM errors (when API key missing or call fails)
- [ ] Calendar token refresh happens silently (no popup) when possible
- [ ] PWA install button appears in Settings when installable; hidden when already installed
- [ ] Empty states on Home, Sessions, Reflect have warm copy
- [ ] Lighthouse mobile Performance ≥ 80 (or document why it's lower)
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## Project Definition of Done (all 5 waves)

- [x] Wave 1: Foundation (PWA skeleton + schemas + repos + onboarding)
- [x] Wave 2: Core entities (sessions CRUD + dashboard + streak + milestones)
- [x] Wave 3: LLM stack (3 adapters + 10 providers + coach comments + reflections)
- [x] Wave 4: Calendar integration (GIS OAuth + sync + non-destructive disconnect)
- [ ] Wave 5: Polish (Athena unlock + silent refresh + PWA install + toasts)

After Wave 5 ships, chrono-kata is a complete, beautiful, AI-coach-enhanced practice tracker PWA meeting the full spec.
