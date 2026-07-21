# chrono-kata Wave 7: Daily Reminder Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship Web Notifications for daily practice reminders. User picks a reminder time in Settings; if permission granted, a notification fires daily at that time (when the app is open in a tab). For closed-app delivery (true background scheduling), document as a known limitation — Service Workers' `showNotification` requires permission but firing on a schedule without keeping the tab alive is limited. Pragmatic v1: fire on tab focus + check elapsed time since last session.

**Architecture:** `Notification` API for showing, `Notification.requestPermission()` for consent. Single `useNotificationReminder` hook manages state. Time picker in Settings. Daily check on tab focus — if it's the user's reminder time and they haven't logged today, fire a notification.

**Tech Stack:** Same as Waves 1–6. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`.
- **Permissions:** Web Notifications require HTTPS or localhost. App is local-first PWA so localhost always works; in production the Vercel deployment is HTTPS.
- **No background scheduling in v1.** Documented limitation: notifications fire only when app is open in a browser tab. Service Worker `showNotification` could add a partial fallback in a later wave.
- **Settings schema:** add `reminderTime: string | null` (HH:MM format, e.g. "20:30") and `notificationsEnabled: boolean` to existing settings singleton.
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.
- **`motion/react`** for motion.

---

## File Structure (Wave 7 additions)

```
src/
├── lib/
│   └── notifications/
│       └── reminder.ts                       # NEW — pure functions for time math + permission state
├── hooks/
│   └── useNotificationReminder.ts            # NEW — manage reminder state + daily check
├── components/
│   └── settings/
│       └── ReminderSettings.tsx              # NEW — time picker + permission UI
└── app/(main)/
    └── settings/
        └── page.tsx                          # MODIFY — add <ReminderSettings />
tests/
└── unit/
    └── notifications/
        └── reminder.test.ts                  # NEW — pure function tests
```

---

## Task 1: Reminder time math (TDD)

**Files:**
- Create: `src/lib/notifications/reminder.ts`
- Test: `tests/unit/notifications/reminder.test.ts`

- [ ] **Step 1: Test**

Create `tests/unit/notifications/reminder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldFireReminder, parseTimeString, formatTimeString, getLastLogDate } from '@/lib/notifications/reminder';
import type { Session } from '@/lib/schemas/session';

describe('parseTimeString / formatTimeString', () => {
  it('parses valid HH:MM', () => {
    expect(parseTimeString('20:30')).toEqual({ hours: 20, minutes: 30 });
  });

  it('rejects invalid formats', () => {
    expect(parseTimeString('25:00')).toBeNull();
    expect(parseTimeString('20:60')).toBeNull();
    expect(parseTimeString('bad')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });

  it('formats hours + minutes back to HH:MM with padding', () => {
    expect(formatTimeString({ hours: 8, minutes: 5 })).toBe('08:05');
    expect(formatTimeString({ hours: 20, minutes: 30 })).toBe('20:30');
  });

  it('roundtrips', () => {
    const s = '09:45';
    expect(formatTimeString(parseTimeString(s)!)).toBe(s);
  });
});

describe('shouldFireReminder', () => {
  it('returns false if reminderTime is null', () => {
    expect(shouldFireReminder({ reminderTime: null, notificationsEnabled: true, lastSessionDate: null, now: new Date('2026-07-21T20:30:00') })).toBe(false);
  });

  it('returns false if notificationsEnabled is false', () => {
    expect(shouldFireReminder({ reminderTime: '20:30', notificationsEnabled: false, lastSessionDate: null, now: new Date('2026-07-21T20:30:00') })).toBe(false);
  });

  it('returns false if current time is more than 30 minutes past reminder time', () => {
    expect(shouldFireReminder({ reminderTime: '20:30', notificationsEnabled: true, lastSessionDate: null, now: new Date('2026-07-21T22:00:00') })).toBe(false);
  });

  it('returns false if user already logged today', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: '2026-07-21',
      now: new Date('2026-07-21T20:30:00'),
    })).toBe(false);
  });

  it('returns true within 30-minute window of reminder time when no log today', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: null,
      now: new Date('2026-07-21T20:30:00'),
    })).toBe(true);
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: '2026-07-20',
      now: new Date('2026-07-21T20:45:00'),
    })).toBe(true);
  });

  it('returns true up to 30 minutes before reminder time', () => {
    expect(shouldFireReminder({
      reminderTime: '20:30',
      notificationsEnabled: true,
      lastSessionDate: null,
      now: new Date('2026-07-21T20:00:00'),
    })).toBe(true);
  });
});

describe('getLastLogDate', () => {
  const ses = (date: Date): Session => ({
    id: crypto.randomUUID(),
    startedAt: date,
    durationMinutes: 30,
    reps: null,
    rating: 3,
    createdAt: date,
    updatedAt: date,
  } as Session);

  it('returns most recent local date string', () => {
    const sessions = [
      ses(new Date('2026-07-15T10:00:00')),
      ses(new Date('2026-07-21T10:00:00')),
      ses(new Date('2026-07-18T10:00:00')),
    ];
    const date = new Date('2026-07-21T23:59:59');
    expect(getLastLogDate(sessions, date)).toBe('2026-07-21');
  });

  it('returns null for no sessions', () => {
    expect(getLastLogDate([], new Date('2026-07-21'))).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

Create `src/lib/notifications/reminder.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface ParsedTime {
  hours: number;
  minutes: number;
}

export function parseTimeString(s: string): ParsedTime | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatTimeString(t: ParsedTime): string {
  return `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
}

interface ShouldFireArgs {
  reminderTime: string | null;
  notificationsEnabled: boolean;
  lastSessionDate: string | null; // YYYY-MM-DD local
  now: Date;
}

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function shouldFireReminder({
  reminderTime,
  notificationsEnabled,
  lastSessionDate,
  now,
}: ShouldFireArgs): boolean {
  if (!reminderTime || !notificationsEnabled) return false;

  const parsed = parseTimeString(reminderTime);
  if (!parsed) return false;

  // Build today's reminder time as a Date.
  const todayKey = toLocalDateString(now);
  const reminderToday = new Date(now);
  reminderToday.setHours(parsed.hours, parsed.minutes, 0, 0);

  const diff = now.getTime() - reminderToday.getTime();
  if (diff < -WINDOW_MS || diff > WINDOW_MS) return false;

  // Skip if user already logged today.
  if (lastSessionDate === todayKey) return false;

  return true;
}

export function getLastLogDate(sessions: Session[], now: Date): string | null {
  if (sessions.length === 0) return null;
  let mostRecent: Date | null = null;
  for (const s of sessions) {
    if (mostRecent === null || s.startedAt.getTime() > mostRecent.getTime()) {
      mostRecent = s.startedAt;
    }
  }
  return mostRecent ? toLocalDateString(mostRecent) : null;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- reminder`
Expected: 11 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: reminder time math - parse/format/shouldFire with tests" }
```

---

## Task 2: useNotificationReminder hook

**Files:**
- Create: `src/hooks/useNotificationReminder.ts`

- [ ] **Step 1: Implement hook**

Create `src/hooks/useNotificationReminder.ts`:

```typescript
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { useSettings } from '@/hooks/useSettings';
import { shouldFireReminder, getLastLogDate } from '@/lib/notifications/reminder';

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

export function useNotificationReminder() {
  const qc = useQueryClient();
  const { settings, updateSettings } = useSettings();
  const [permission, setPermission] = useState<Permission>('default');
  const lastFiredKeyRef = useRef<string | null>(null);

  // Initialize permission state on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await updateSettings({ notificationsEnabled: true });
    }
    return result;
  }, [updateSettings]);

  // Check on tab focus + every 60s while open.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      if (!settings) return;
      if (permission !== 'granted') return;
      if (!settings.notificationsEnabled || !settings.reminderTime) return;

      const sessions = await sessionRepo.getAll();
      const lastDate = getLastLogDate(sessions, new Date());
      const now = new Date();

      if (shouldFireReminder({
        reminderTime: settings.reminderTime,
        notificationsEnabled: settings.notificationsEnabled,
        lastSessionDate: lastDate,
        now,
      })) {
        // Don't fire twice in the same (HH:MM) slot.
        const slotKey = `${toLocalDateKey(now)} ${settings.reminderTime}`;
        if (lastFiredKeyRef.current === slotKey) return;
        lastFiredKeyRef.current = slotKey;

        new Notification('chrono-kata', {
          body: 'A small practice tonight — it counts.',
          icon: '/icons/192.png',
          tag: 'chrono-kata-reminder',
        });
      }
    }

    void check();
    const intervalId = setInterval(check, 60_000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [settings, permission]);

  const setReminderTime = useCallback(async (time: string | null) => {
    await updateSettings({ reminderTime: time });
    qc.invalidateQueries({ queryKey: ['settings'] });
  }, [updateSettings, qc]);

  return {
    permission,
    requestPermission,
    setReminderTime,
    reminderTime: settings?.reminderTime ?? null,
    enabled: settings?.notificationsEnabled ?? false,
  };
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: useNotificationReminder hook with focus + interval checks" }
```

---

## Task 3: ReminderSettings UI + Settings page integration

**Files:**
- Create: `src/components/settings/ReminderSettings.tsx`
- Modify: `src/app/(main)/settings/page.tsx` to include `<ReminderSettings />`
- Modify: `src/lib/schemas/settings.ts` to add `reminderTime` and `notificationsEnabled` fields

- [ ] **Step 1: Add fields to Settings schema**

Modify `src/lib/schemas/settings.ts`:

```typescript
import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const SettingsSchema = z.object({
  id: z.literal('singleton'),
  displayName: z.string().max(50).optional(),
  selectedCoachPersonality: CoachPersonalitySchema,
  unlockedPersonalities: z.array(CoachPersonalitySchema),
  googleCalendarId: z.string().nullable().optional(),
  googleCalendarSyncEnabled: z.boolean(),
  googleCalendarConnectedAt: z.date().nullable().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'> = {
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: null,
  googleCalendarSyncEnabled: false,
  googleCalendarConnectedAt: null,
  reminderTime: null,
  notificationsEnabled: false,
};
```

- [ ] **Step 2: ReminderSettings component**

Create `src/components/settings/ReminderSettings.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNotificationReminder } from '@/hooks/useNotificationReminder';
import { parseTimeString, formatTimeString } from '@/lib/notifications/reminder';

export function ReminderSettings() {
  const {
    permission,
    requestPermission,
    setReminderTime,
    reminderTime,
    enabled,
  } = useNotificationReminder();

  const [pendingTime, setPendingTime] = useState<string>(reminderTime ?? '20:30');

  async function enable() {
    const result = await requestPermission();
    if (result === 'granted') {
      const parsed = parseTimeString(pendingTime);
      if (parsed) {
        await setReminderTime(formatTimeString(parsed));
      }
    }
  }

  async function updateTime(newTime: string) {
    setPendingTime(newTime);
    if (enabled) {
      const parsed = parseTimeString(newTime);
      if (parsed) await setReminderTime(formatTimeString(parsed));
    }
  }

  async function disable() {
    await setReminderTime(null);
  }

  if (permission === 'unsupported') {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
          Daily Reminder
        </div>
        <p className="text-text-muted text-sm">Notifications not supported in this browser.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        Daily Reminder
      </div>

      {!enabled || permission !== 'granted' ? (
        <>
          <p className="text-text-muted text-sm mb-3">
            Get a gentle daily nudge if you haven't logged a session. Notifications fire while the app is open in a tab.
          </p>
          {permission === 'denied' ? (
            <p className="text-hype text-sm">
              Notifications are blocked in your browser settings. Enable them to use reminders.
            </p>
          ) : (
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-2 text-sm text-text-muted">
                Time
                <input
                  type="time"
                  value={pendingTime}
                  onChange={(e) => updateTime(e.target.value)}
                  className="bg-surface-2 border border-border rounded-2xl px-3 py-1.5 text-text"
                />
              </label>
              <Button onClick={enable}>Enable reminder</Button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <span className="text-text-muted text-sm">Time</span>
            <input
              type="time"
              value={reminderTime ?? ''}
              onChange={(e) => updateTime(e.target.value)}
              className="bg-surface-2 border border-border rounded-2xl px-3 py-1.5 text-text"
            />
          </label>
          <div>
            <Button variant="ghost" onClick={disable}>Disable reminder</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Add to Settings page**

Modify `src/app/(main)/settings/page.tsx`:

```tsx
import { ReminderSettings } from '@/components/settings/ReminderSettings';
// ... inside JSX, after existing cards (e.g., after CalendarSettings):
<ReminderSettings />
```

- [ ] **Step 4: Verify typecheck + dev**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: reminder settings UI + schema fields" }
```

---

## Task 4: Final Wave 7 verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 106 prior + 11 new = 117 tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 7 final verification" } }
```

---

## Wave 7 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — 117+ tests pass
- [ ] `npm run build` succeeds
- [ ] Settings page shows "Daily Reminder" card
- [ ] User can pick a time + enable reminder → permission requested
- [ ] Once granted, a `Notification` fires within the 30-min window of reminder time when no session logged today
- [ ] Notification fires at most once per day (slot-keyed dedup)
- [ ] Disabling reminder clears the time
- [ ] Browser with no `Notification` support shows graceful fallback
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## Known Limitation (documented, not blocking)

**Notifications only fire when the app is open in a browser tab.** True background scheduling (Service Worker `showNotification` with a deferred event, or Push API) requires either a backend, native app, or PWA install with persistent service worker registration. v1 scope: tab-focused + 60s polling while open. Future: SW-based scheduling once backend exists (Wave 8+ sync).

## What's Next (Future Waves)

- **Wave 8: Streaming LLM** — replace polling-style "Coach is thinking…" with token-by-token streaming for snappier UX.
- **Wave 9: Multi-dimensional ratings** — focus/energy/mood sliders alongside the 1-5.
- **Wave 10: Theme toggle** — light mode support via CSS variables.