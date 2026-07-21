# chrono-kata Wave 2: Core Entities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the session-logging flow end-to-end. User can create a session (timed or reps + label + rating + note), see it appear in the sessions list grouped by day, see today's totals + 7-day streak + mini week chart on Home, edit or delete existing sessions, and trigger basic milestone celebrations. No LLM, no calendar yet.

**Architecture:** Builds on Wave 1's foundation (Dexie, Zod schemas, repositories, tab-bar shell). Adds: streak computation as a pure module wired into session save; React Query mutations for optimistic UI; Framer Motion-powered session form modal; day-grouped session list; small chart component.

**Tech Stack:** Same as Wave 1 (Next.js 15, Dexie, Zod, TanStack Query, motion, Tailwind 4, Vitest). No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1. Use `; if ($?) { ... }` for command chaining. Do NOT use `&&`.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **Existing structure:** Wave 1 ships under `src/app/(main)/`. All Wave 2 page changes go inside the same route group.
- **TypeScript strict:** No `as any`, no `@ts-ignore`, ever.
- **Color tokens (defined in Wave 1):** accent `#F5A623`, sage `#9CAF88` (zen), magenta `#E85D75` (hype), cyan `#6BB7D9` (analyst).
- **Commit message style:** `feat:`/`fix:`/`chore:`/`refactor:`/`test:`/`docs:` prefix, lowercase, imperative.
- **No new external dependencies.** Reuse what Wave 1 installed.
- **Rating UI:** 5 emoji buttons (😄 😐 🙂 😕 😢 mapped to 5/4/3/2/1 — note the order; selected is highlighted, others dim).
- **Mutual exclusion:** A session has EITHER `durationMinutes` OR `reps`, never both. Form logic enforces this.
- **Streak predicate (from spec §9):** streak is alive on day D iff the most recent session date ≤ D is either D or D−1.

---

## File Structure (Wave 2 additions)

```
src/
├── app/(main)/
│   ├── page.tsx                              # MODIFY — populate with real data
│   ├── sessions/page.tsx                     # MODIFY — full list
│   └── sessions/[id]/page.tsx                # NEW — detail/edit
├── components/
│   ├── session/
│   │   ├── SessionForm.tsx                   # NEW — modal sheet
│   │   ├── SessionCard.tsx                   # NEW — list row
│   │   ├── Timer.tsx                         # NEW — running timer display
│   │   └── RatingPicker.tsx                  # NEW — 5 emoji buttons
│   ├── dashboard/
│   │   ├── TodaySummary.tsx                  # NEW — totals card
│   │   └── WeekChart.tsx                     # NEW — 7-bar chart
│   ├── streak/
│   │   └── MilestoneCelebration.tsx          # NEW — confetti overlay
│   └── ui/
│       ├── Modal.tsx                         # NEW — bottom-sheet modal
│       └── ConfirmDialog.tsx                 # NEW — delete confirmation
├── lib/
│   ├── streak/
│   │   ├── compute-streak.ts                 # NEW — pure function
│   │   └── milestones.ts                     # NEW — milestone list + helpers
│   └── utils/
│       ├── date.ts                           # NEW — YYYY-MM-DD, day-grouping
│       └── format.ts                         # NEW — duration/reps formatting
├── hooks/
│   ├── useSessions.ts                        # NEW — list query + mutations
│   └── useStreak.ts                          # MODIFY or NEW — wire computeStreak into save
└── tests/
    └── unit/
        ├── streak/
        │   ├── compute-streak.test.ts        # NEW — comprehensive
        │   └── milestones.test.ts             # NEW
        └── utils/
            ├── date.test.ts                   # NEW
            └── format.test.ts                 # NEW
```

---

## Task 1: Date and format utilities (TDD)

**Files:**
- Create: `src/lib/utils/date.ts`, `src/lib/utils/format.ts`
- Test: `tests/unit/utils/date.test.ts`, `tests/unit/utils/format.test.ts`

**Interfaces:**
- Produces: `toLocalDateString(date: Date): string` (YYYY-MM-DD local), `groupSessionsByDay(sessions): Map<string, Session[]>`, `formatDuration(minutes): string`, `formatSessionSummary(session): string`.

- [ ] **Step 1: Write failing tests for date utils**

Create `tests/unit/utils/date.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toLocalDateString, groupSessionsByDay } from '@/lib/utils/date';
import type { Session } from '@/lib/schemas/session';

describe('toLocalDateString', () => {
  it('formats a Date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 6, 21, 14, 30); // local Jul 21 2026 14:30
    expect(toLocalDateString(d)).toBe('2026-07-21');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 8, 0); // local Jan 5 2026
    expect(toLocalDateString(d)).toBe('2026-01-05');
  });
});

describe('groupSessionsByDay', () => {
  const baseSession = (id: string, startedAt: Date): Session => ({
    id,
    startedAt,
    durationMinutes: 30,
    reps: null,
    rating: 3,
    createdAt: startedAt,
    updatedAt: startedAt,
  });

  it('groups sessions by local YYYY-MM-DD', () => {
    const sessions = [
      baseSession('1', new Date(2026, 6, 21, 10, 0)),
      baseSession('2', new Date(2026, 6, 21, 14, 0)),
      baseSession('3', new Date(2026, 6, 20, 9, 0)),
    ];
    const grouped = groupSessionsByDay(sessions);
    expect(grouped.get('2026-07-21')).toHaveLength(2);
    expect(grouped.get('2026-07-20')).toHaveLength(1);
  });

  it('returns an empty map for no sessions', () => {
    expect(groupSessionsByDay([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- date.test`
Expected: FAIL with "Cannot find module '@/lib/utils/date'".

- [ ] **Step 3: Implement date utils**

Create `src/lib/utils/date.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';

export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupSessionsByDay(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const list = map.get(key);
    if (list) {
      list.push(s);
    } else {
      map.set(key, [s]);
    }
  }
  return map;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateString(a) === toLocalDateString(b);
}
```

- [ ] **Step 4: Run date tests to verify pass**

Run: `npm test -- date.test`
Expected: 3 tests pass.

- [ ] **Step 5: Write failing tests for format utils**

Create `tests/unit/utils/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatDuration, formatSessionSummary } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

describe('formatDuration', () => {
  it('formats minutes under 60 as "Xm"', () => {
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(5)).toBe('5m');
  });

  it('formats 60 minutes as "1h"', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats 90 minutes as "1h 30m"', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats 0 minutes as "0m"', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatSessionSummary', () => {
  const base = (overrides: Partial<Session>): Session => ({
    id: 'test',
    startedAt: new Date(2026, 6, 21, 10, 0),
    rating: 3,
    createdAt: new Date(2026, 6, 21, 10, 0),
    updatedAt: new Date(2026, 6, 21, 10, 0),
    ...overrides,
  } as Session);

  it('returns "30m · meditation" for a timed session with label', () => {
    expect(
      formatSessionSummary(
        base({ durationMinutes: 30, reps: null, activityLabel: 'meditation' })
      )
    ).toBe('30m · meditation');
  });

  it('returns "108 reps" for a reps session without label', () => {
    expect(
      formatSessionSummary(base({ durationMinutes: null, reps: 108 }))
    ).toBe('108 reps');
  });

  it('returns "30m" for a timed session without label', () => {
    expect(formatSessionSummary(base({ durationMinutes: 30, reps: null }))).toBe(
      '30m'
    );
  });
});
```

- [ ] **Step 6: Implement format utils**

Create `src/lib/utils/format.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';

export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatSessionSummary(s: Session): string {
  const parts: string[] = [];
  if (s.durationMinutes != null) {
    parts.push(formatDuration(s.durationMinutes));
  } else if (s.reps != null) {
    parts.push(`${s.reps} reps`);
  }
  if (s.activityLabel) {
    parts.push(s.activityLabel);
  }
  return parts.join(' · ');
}
```

- [ ] **Step 7: Run all utils tests**

Run: `npm test -- utils/`
Expected: 7 tests pass (3 date + 4 format).

- [ ] **Step 8: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: date and format utilities with tests" }
```

---

## Task 2: Streak computation (TDD)

**Files:**
- Create: `src/lib/streak/milestones.ts`, `src/lib/streak/compute-streak.ts`
- Test: `tests/unit/streak/milestones.test.ts`, `tests/unit/streak/compute-streak.test.ts`

**Interfaces:**
- Produces: `MILESTONES` constant `[3,7,14,30,60,90,180,365]`, `isNewMilestone(current, previous): number | null`, `computeStreak({ sessions, previousStreak, now }): StreakState`.

- [ ] **Step 1: Write failing test for milestones**

Create `tests/unit/streak/milestones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MILESTONES, isNewMilestone } from '@/lib/streak/milestones';

describe('MILESTONES', () => {
  it('returns the fixed list from the spec', () => {
    expect(MILESTONES).toEqual([3, 7, 14, 30, 60, 90, 180, 365]);
  });
});

describe('isNewMilestone', () => {
  it('returns the milestone crossed going from 6 to 7 days', () => {
    expect(isNewMilestone(7, 6)).toBe(7);
  });

  it('returns null when no milestone is crossed', () => {
    expect(isNewMilestone(8, 7)).toBeNull();
  });

  it('returns null when current is below previous', () => {
    expect(isNewMilestone(5, 7)).toBeNull();
  });

  it('caps at 365', () => {
    expect(isNewMilestone(400, 364)).toBe(365);
  });

  it('handles first milestone crossing (3)', () => {
    expect(isNewMilestone(3, 2)).toBe(3);
  });
});
```

- [ ] **Step 2: Implement milestones**

Create `src/lib/streak/milestones.ts`:

```typescript
export const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

/**
 * If `current` crossed a milestone that `previous` had not, return the highest
 * such milestone. Otherwise null. Capped at 365.
 */
export function isNewMilestone(current: number, previous: number): number | null {
  if (current <= previous) return null;
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (previous < m && current >= m) {
      crossed = m;
    }
  }
  return crossed;
}

export function milestoneForDay(day: number): number | null {
  if (MILESTONES.includes(day as (typeof MILESTONES)[number])) {
    return day;
  }
  return null;
}
```

- [ ] **Step 3: Run milestones tests**

Run: `npm test -- milestones.test`
Expected: 6 tests pass.

- [ ] **Step 4: Write failing test for compute-streak**

Create `tests/unit/streak/compute-streak.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/lib/streak/compute-streak';
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';

const baseSession = (startedAt: Date): Session => ({
  id: crypto.randomUUID(),
  startedAt,
  durationMinutes: 30,
  reps: null,
  rating: 3,
  createdAt: startedAt,
  updatedAt: startedAt,
});

const emptyStreak = (overrides: Partial<Streak> = {}): Streak => ({
  id: 'singleton',
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastSessionDate: '1970-01-01',
  milestonesAchieved: [],
  updatedAt: new Date(),
  ...overrides,
});

describe('computeStreak', () => {
  it('returns streak=1 on first-ever session today', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const result = computeStreak({
      sessions: [baseSession(now)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
    expect(result.longestStreakDays).toBe(1);
    expect(result.lastSessionDate).toBe('2026-07-21');
    expect(result.milestonesAchieved).toEqual([]);
  });

  it('extends streak to 2 when yesterday also had a session', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const yesterday = new Date(2026, 6, 20, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(yesterday), baseSession(now)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(2);
  });

  it('keeps streak alive with 1-day grace (no session today, one yesterday)', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const yesterday = new Date(2026, 6, 20, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(yesterday)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
  });

  it('resets streak to 0 if last session was 2+ days ago', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const threeDaysAgo = new Date(2026, 6, 18, 10, 0);
    const result = computeStreak({
      sessions: [baseSession(threeDaysAgo)],
      previousStreak: emptyStreak({ currentStreakDays: 5, longestStreakDays: 5 }),
      now,
    });
    expect(result.currentStreakDays).toBe(0);
    expect(result.longestStreakDays).toBe(5); // preserved
  });

  it('counts 7 consecutive days as streak=7', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(7);
  });

  it('multi-session same day counts once', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const alsoNow = new Date(2026, 6, 21, 14, 0);
    const result = computeStreak({
      sessions: [baseSession(now), baseSession(alsoNow)],
      previousStreak: emptyStreak(),
      now,
    });
    expect(result.currentStreakDays).toBe(1);
  });

  it('records 7 as a milestone when crossing from 6 to 7', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak({ currentStreakDays: 6, longestStreakDays: 6 }),
      now,
    });
    expect(result.milestonesAchieved).toContain(7);
  });

  it('preserves existing milestonesAchieved and appends new ones', () => {
    const now = new Date(2026, 6, 21, 10, 0);
    const sessions: Session[] = [];
    for (let i = 0; i < 7; i++) {
      sessions.push(baseSession(new Date(2026, 6, 21 - i, 10, 0)));
    }
    const result = computeStreak({
      sessions,
      previousStreak: emptyStreak({
        currentStreakDays: 6,
        longestStreakDays: 6,
        milestonesAchieved: [3],
      }),
      now,
    });
    expect(result.milestonesAchieved).toEqual([3, 7]);
  });
});
```

- [ ] **Step 5: Implement compute-streak**

Create `src/lib/streak/compute-streak.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';
import { isNewMilestone } from './milestones';
import { toLocalDateString } from '@/lib/utils/date';

interface Args {
  sessions: Session[];
  previousStreak: Streak;
  now: Date;
}

/**
 * Compute the new streak state after a session save.
 *
 * The streak is ALIVE on day D iff the most recent session date ≤ D is either
 * D itself or D−1 (1-day grace window).
 *
 * Walk backwards from "today" (or "yesterday" if today has no session) and
 * count consecutive days with ≥1 session. Stop at the first gap.
 */
export function computeStreak({ sessions, previousStreak, now }: Args): Streak {
  if (sessions.length === 0) {
    return {
      ...previousStreak,
      updatedAt: now,
    };
  }

  // Set of local YYYY-MM-DD strings that have at least one session.
  const sessionDays = new Set(sessions.map((s) => toLocalDateString(s.startedAt)));

  const today = toLocalDateString(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toLocalDateString(yesterdayDate);

  // Determine the "anchor" day: today if it has a session, else yesterday.
  let anchor: string;
  if (sessionDays.has(today)) {
    anchor = today;
  } else if (sessionDays.has(yesterday)) {
    anchor = yesterday;
  } else {
    // Streak is dead.
    return {
      ...previousStreak,
      currentStreakDays: 0,
      updatedAt: now,
    };
  }

  // Walk backwards from anchor counting consecutive days.
  let count = 0;
  const cursor = new Date(anchor + 'T00:00:00');
  while (true) {
    const key = toLocalDateString(cursor);
    if (!sessionDays.has(key)) break;
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const longest = Math.max(previousStreak.longestStreakDays, count);
  const crossed = isNewMilestone(count, previousStreak.currentStreakDays);
  const milestonesAchieved = crossed
    ? [...previousStreak.milestonesAchieved, crossed]
    : previousStreak.milestonesAchieved;

  return {
    id: 'singleton',
    currentStreakDays: count,
    longestStreakDays: longest,
    lastSessionDate: today,
    milestonesAchieved,
    updatedAt: now,
  };
}
```

- [ ] **Step 6: Run streak tests**

Run: `npm test -- streak/`
Expected: 14 tests pass (6 milestones + 8 compute-streak).

- [ ] **Step 7: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: streak computation + milestones with tests" }
```

---

## Task 3: Wire streak into session save (hook + integration)

**Files:**
- Create: `src/hooks/useSessions.ts`, `src/hooks/useStreak.ts`
- Modify: (none — the wiring happens inside the hook's mutation)

**Interfaces:**
- Produces: `useSessions()` returning `{ sessions, createSession, updateSession, deleteSession }`; `useStreak()` returning `{ streak, refreshStreak }`.

- [ ] **Step 1: useStreak hook**

Create `src/hooks/useStreak.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { streakRepo } from '@/lib/db/streak.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { computeStreak } from '@/lib/streak/compute-streak';

const KEY = ['streak'] as const;

export function useStreak() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => streakRepo.get(),
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const [current, sessions] = await Promise.all([
        streakRepo.get(),
        sessionRepo.getAll(),
      ]);
      const next = computeStreak({
        sessions,
        previousStreak: current,
        now: new Date(),
      });
      await streakRepo.save(next);
      return next;
    },
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    streak: query.data,
    recompute: recompute.mutateAsync,
  };
}
```

- [ ] **Step 2: useSessions hook**

Create `src/hooks/useSessions.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionRepo } from '@/lib/db/session.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { computeStreak } from '@/lib/streak/compute-streak';
import type { Session, SessionInput } from '@/lib/schemas/session';

const KEY = ['sessions'] as const;

async function recomputeStreakSideEffect() {
  const [current, sessions] = await Promise.all([
    streakRepo.get(),
    sessionRepo.getAll(),
  ]);
  const next = computeStreak({
    sessions,
    previousStreak: current,
    now: new Date(),
  });
  await streakRepo.save(next);
  return next;
}

export function useSessions() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => sessionRepo.getAll(),
  });

  const invalidateBoth = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['streak'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: SessionInput) => sessionRepo.save(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const optimistic: Session = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        coachComment: null,
        calendarEventId: null,
        failedLLM: false,
      };
      const previous = qc.getQueryData<Session[]>(KEY);
      qc.setQueryData<Session[]>(KEY, (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Session> }) =>
      sessionRepo.update(id, patch),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sessionRepo.delete(id),
    onSettled: async () => {
      await recomputeStreakSideEffect();
      invalidateBoth();
    },
  });

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    createSession: createMutation.mutateAsync,
    updateSession: updateMutation.mutateAsync,
    deleteSession: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: useSessions + useStreak hooks with optimistic UI" }
```

---

## Task 4: UI primitives — Modal + ConfirmDialog + RatingPicker

**Files:**
- Create: `src/components/ui/Modal.tsx`, `src/components/ui/ConfirmDialog.tsx`, `src/components/session/RatingPicker.tsx`

**Interfaces:**
- Produces: `<Modal>` (bottom-sheet that slides up on mobile), `<ConfirmDialog>` (modal with message + confirm/cancel), `<RatingPicker>` (5 emoji buttons, calls `onPick(rating)`).

- [ ] **Step 1: Modal component**

Create `src/components/ui/Modal.tsx`:

```tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ open, onClose, children, title }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-base/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            className="relative bg-surface border-t border-border sm:border sm:rounded-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {title && (
              <div className="sticky top-0 bg-surface px-5 pt-5 pb-3 border-b border-border">
                <h2 className="font-serif text-xl text-text">{title}</h2>
              </div>
            )}
            <div className="px-5 pb-6 pt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: ConfirmDialog**

Create `src/components/ui/ConfirmDialog.tsx`:

```tsx
'use client';

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
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-text-muted mb-6">{message}</p>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: RatingPicker**

Create `src/components/session/RatingPicker.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';
import type { Rating } from '@/lib/schemas/session';

const OPTIONS: { value: Rating; emoji: string; label: string }[] = [
  { value: 5, emoji: '😄', label: 'Great' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 3, emoji: '😐', label: 'OK' },
  { value: 2, emoji: '😕', label: 'Meh' },
  { value: 1, emoji: '😢', label: 'Poor' },
];

interface Props {
  value: Rating | null;
  onChange: (r: Rating) => void;
}

export function RatingPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <motion.button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            whileTap={{ scale: 0.9 }}
            className={`flex flex-col items-center gap-1 py-2 rounded-2xl border transition-colors ${
              selected
                ? 'border-accent bg-accent/10'
                : 'border-border bg-surface-2'
            }`}
            aria-label={o.label}
            aria-pressed={selected}
          >
            <span className={`text-2xl ${selected ? '' : 'opacity-50'}`}>{o.emoji}</span>
            <span className={`text-xs ${selected ? 'text-accent' : 'text-text-muted'}`}>
              {o.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: Modal, ConfirmDialog, RatingPicker primitives" }
```

---

## Task 5: Timer + SessionForm (the create flow)

**Files:**
- Create: `src/components/session/Timer.tsx`, `src/components/session/SessionForm.tsx`

**Interfaces:**
- Produces: `<Timer>` (start/stop with elapsed display), `<SessionForm>` (modal sheet for creating/editing sessions). The form calls `onSave(input)` or `onCancel()`.

- [ ] **Step 1: Timer component**

Create `src/components/session/Timer.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface Props {
  startedAt: Date | null;
  onStart: () => void;
  onStop: (durationMinutes: number) => void;
  onReset: () => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function Timer({ startedAt, onStart, onStop, onReset }: Props) {
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt]);

  const elapsedMs = startedAt ? now - startedAt.getTime() : 0;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <motion.div
        className="font-serif text-5xl text-accent tabular-nums"
        animate={startedAt ? { scale: [1, 1.01, 1] } : { scale: 1 }}
        transition={{ duration: 2, repeat: startedAt ? Infinity : 0 }}
      >
        {formatElapsed(elapsedMs)}
      </motion.div>
      <div className="flex gap-2">
        {!startedAt ? (
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 bg-accent text-base px-5 py-2.5 rounded-full font-medium"
          >
            <Play size={18} /> Start
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStop(Math.max(1, Math.round(elapsedMs / 60000)))}
            className="flex items-center gap-2 bg-hype text-base px-5 py-2.5 rounded-full font-medium"
          >
            <Pause size={18} /> Stop
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          disabled={!startedAt}
          className="flex items-center gap-2 bg-surface-2 text-text px-4 py-2.5 rounded-full disabled:opacity-40"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SessionForm**

Create `src/components/session/SessionForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { RatingPicker } from './RatingPicker';
import { Timer } from './Timer';
import type { Session, SessionInput } from '@/lib/schemas/session';
import type { Rating } from '@/lib/schemas/session';

type Mode = 'timed' | 'reps';

interface Props {
  open: boolean;
  initial?: Session | null;
  onSave: (input: SessionInput) => void;
  onCancel: () => void;
}

export function SessionForm({ open, initial, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('timed');
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    initial?.durationMinutes ?? null
  );
  const [reps, setReps] = useState<number | null>(initial?.reps ?? null);
  const [rating, setRating] = useState<Rating | null>(initial?.rating ?? null);
  const [activityLabel, setActivityLabel] = useState(initial?.activityLabel ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleTimerStop(minutes: number) {
    setDurationMinutes(minutes);
    setTimerStartedAt(null);
    if (mode !== 'timed') setMode('timed');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (rating == null) {
      setError('Pick a rating.');
      return;
    }
    if (mode === 'timed' && durationMinutes == null) {
      setError('Start the timer or enter a duration.');
      return;
    }
    if (mode === 'reps' && (reps == null || reps < 1)) {
      setError('Enter a rep count.');
      return;
    }

    const input: SessionInput = {
      startedAt: initial?.startedAt ?? (timerStartedAt ?? new Date()),
      endedAt: mode === 'timed' ? new Date() : null,
      durationMinutes: mode === 'timed' ? durationMinutes : null,
      reps: mode === 'reps' ? reps : null,
      rating,
      activityLabel: activityLabel.trim() || undefined,
      note: note.trim() || undefined,
    };
    onSave(input);
  }

  return (
    <Modal open={open} onClose={onCancel} title={initial ? 'Edit session' : 'New session'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-2xl">
          {(['timed', 'reps'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-2 rounded-xl text-sm capitalize transition-colors ${
                mode === m ? 'bg-accent text-base' : 'text-text-muted'
              }`}
            >
              {m === 'timed' ? '⏱ Timed' : '⊙ Reps'}
            </button>
          ))}
        </div>

        {/* Mode-specific input */}
        {mode === 'timed' ? (
          timerStartedAt || durationMinutes == null ? (
            <Timer
              startedAt={timerStartedAt}
              onStart={() => {
                setTimerStartedAt(new Date());
                setDurationMinutes(null);
              }}
              onStop={handleTimerStop}
              onReset={() => {
                setTimerStartedAt(null);
                setDurationMinutes(null);
              }}
            />
          ) : (
            <label className="block">
              <span className="text-text-muted text-sm">Duration (minutes)</span>
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text font-serif text-2xl"
              />
            </label>
          )
        ) : (
          <label className="block">
            <span className="text-text-muted text-sm">Reps</span>
            <input
              type="number"
              min={1}
              value={reps ?? ''}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text font-serif text-2xl"
            />
          </label>
        )}

        {/* Activity label */}
        <label className="block">
          <span className="text-text-muted text-sm">Activity (optional)</span>
          <input
            type="text"
            maxLength={100}
            value={activityLabel}
            onChange={(e) => setActivityLabel(e.target.value)}
            placeholder="meditation, trading review, push-ups…"
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>

        {/* Rating */}
        <div>
          <div className="text-text-muted text-sm mb-2">Rating</div>
          <RatingPicker value={rating} onChange={setRating} />
        </div>

        {/* Note */}
        <label className="block">
          <span className="text-text-muted text-sm">Note (optional)</span>
          <textarea
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text resize-none"
          />
        </label>

        {error && <p className="text-hype text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{initial ? 'Save changes' : 'Save session'}</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: Timer + SessionForm for create/edit flow" }
```

---

## Task 6: SessionCard + Sessions list page

**Files:**
- Create: `src/components/session/SessionCard.tsx`
- Modify: `src/app/(main)/sessions/page.tsx`

**Interfaces:**
- Produces: `<SessionCard>` showing rating + summary + time + label/note. Sessions page shows reverse-chronological list grouped by day.

- [ ] **Step 1: SessionCard**

Create `src/components/session/SessionCard.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { formatSessionSummary } from '@/lib/utils/format';

const RATING_EMOJI: Record<number, string> = {
  5: '😄', 4: '🙂', 3: '😐', 2: '😕', 1: '😢',
};

interface Props {
  session: Session;
  onClick?: (s: Session) => void;
  pending?: boolean;
}

export function SessionCard({ session, onClick, pending }: Props) {
  const time = session.startedAt.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(session)}
      className="w-full text-left flex items-start gap-3 py-3"
    >
      <div className="text-2xl shrink-0" aria-hidden>
        {RATING_EMOJI[session.rating]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{time}</span>
          <span className="text-text font-medium truncate">
            {formatSessionSummary(session)}
          </span>
          {pending && (
            <span className="text-xs text-accent animate-pulse">syncing…</span>
          )}
        </div>
        {session.note && (
          <div className="text-text-muted text-sm truncate mt-0.5">
            {session.note}
          </div>
        )}
        {session.coachComment && (
          <div className="mt-2 text-xs italic text-text-muted border-l-2 border-accent pl-2">
            {session.coachComment}
          </div>
        )}
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 2: Sessions page (full list)**

Replace `src/app/(main)/sessions/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSessions } from '@/hooks/useSessions';
import { SessionCard } from '@/components/session/SessionCard';
import { SessionForm } from '@/components/session/SessionForm';
import { groupSessionsByDay } from '@/lib/utils/date';
import type { Session, SessionInput } from '@/lib/schemas/session';

export default function SessionsPage() {
  const { sessions, createSession } = useSessions();
  const [formOpen, setFormOpen] = useState(false);

  const grouped = groupSessionsByDay(sessions);
  const days = Array.from(grouped.keys()).sort().reverse();

  async function handleSave(input: SessionInput) {
    await createSession(input);
    setFormOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Sessions</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="bg-accent text-base px-4 py-2 rounded-full text-sm font-medium"
        >
          + New
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-12">
          No sessions yet. Tap "New" to log your first.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {days.map((day) => (
            <section key={day}>
              <h2 className="text-xs uppercase tracking-wide text-text-muted pt-4 pb-1">
                {formatDayHeading(day)}
              </h2>
              {grouped.get(day)!.map((s) => (
                <SessionCard key={s.id} session={s} pending={!s.calendarEventId && false} />
              ))}
            </section>
          ))}
        </div>
      )}

      <SessionForm
        open={formOpen}
        onSave={handleSave}
        onCancel={() => setFormOpen(false)}
      />
    </div>
  );
}

function formatDayHeading(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
```

- [ ] **Step 3: Verify typecheck + run dev**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run dev` → visit `/sessions` → tap "+ New" → modal opens, fill form, save → row appears. Kill server.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: sessions list grouped by day + new-session modal" }
```

---

## Task 7: Dashboard populated (Today summary + Week chart + real streak)

**Files:**
- Modify: `src/app/(main)/page.tsx` (Home)
- Create: `src/components/dashboard/TodaySummary.tsx`, `src/components/dashboard/WeekChart.tsx`

**Interfaces:**
- Produces: Home page shows live today totals (time + reps + count + avg rating), 7-day streak flame, week bar chart, recent 3 sessions with "View all" link.

- [ ] **Step 1: TodaySummary component**

Create `src/components/dashboard/TodaySummary.tsx`:

```tsx
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function TodaySummary({ sessions }: Props) {
  const totalMinutes = sessions.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0),
    0
  );
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(1)
      : '—';

  return (
    <Card>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Time</div>
          <div className="font-serif text-xl text-text">{formatDuration(totalMinutes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Reps</div>
          <div className="font-serif text-xl text-text">{totalReps}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Sessions</div>
          <div className="font-serif text-xl text-text">{sessions.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Avg rating</div>
          <div className="font-serif text-xl text-text">{avgRating}</div>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: WeekChart component**

Create `src/components/dashboard/WeekChart.tsx`:

```tsx
import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

interface Props {
  sessions: Session[];
}

export function WeekChart({ sessions }: Props) {
  // Build last 7 days.
  const days: { date: Date; label: string; totalMinutes: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: d.toLocaleDateString([], { weekday: 'narrow' }),
      totalMinutes: 0,
    });
  }

  // Sum minutes per day.
  const byDay = new Map(days.map((d) => [toLocalDateString(d.date), d]));
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const day = byDay.get(key);
    if (day) day.totalMinutes += s.durationMinutes ?? 0;
  }

  const maxMinutes = Math.max(60, ...days.map((d) => d.totalMinutes));

  return (
    <div className="flex items-end justify-between gap-1 h-24">
      {days.map((d, i) => {
        const heightPct = (d.totalMinutes / maxMinutes) * 100;
        const isToday = i === days.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className="flex-1 w-full flex items-end">
              <motion.div
                className={`w-full rounded-t-md ${isToday ? 'bg-accent' : 'bg-surface-2'}`}
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ duration: 0.3 }}
                style={{ minHeight: d.totalMinutes > 0 ? 4 : 0 }}
              />
            </div>
            <span className={`text-xs ${isToday ? 'text-accent' : 'text-text-muted'}`}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite Home page**

Replace `src/app/(main)/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useSessions } from '@/hooks/useSessions';
import { useStreak } from '@/hooks/useStreak';
import { TodaySummary } from '@/components/dashboard/TodaySummary';
import { WeekChart } from '@/components/dashboard/WeekChart';
import { StreakFlame } from '@/components/streak/StreakFlame';
import { SessionForm } from '@/components/session/SessionForm';
import { SessionCard } from '@/components/session/SessionCard';
import { toLocalDateString } from '@/lib/utils/date';
import type { SessionInput } from '@/lib/schemas/session';

export default function HomePage() {
  const router = useRouter();
  const { sessions, createSession } = useSessions();
  const { streak } = useStreak();
  const [formOpen, setFormOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    const done = localStorage.getItem('onboarding-completed');
    if (done !== 'true') {
      router.replace('/onboarding');
    } else {
      setOnboardingDone(true);
    }
  }, [router]);

  if (onboardingDone === null) return null;

  const today = toLocalDateString(new Date());
  const todaySessions = sessions.filter(
    (s) => toLocalDateString(s.startedAt) === today
  );
  const last7 = sessions.filter((s) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return s.startedAt >= sevenDaysAgo;
  });
  const recent = sessions.slice(0, 3);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  async function handleSave(input: SessionInput) {
    await createSession(input);
    setFormOpen(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <h1 className="font-serif text-2xl text-text mb-1">{greeting}.</h1>
      <p className="text-text-muted text-sm mb-6">
        {sessions.length === 0
          ? 'No sessions yet. The first step is the whole path.'
          : `${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'} today.`}
      </p>

      <div className="mb-4">
        <StreakFlame days={streak?.currentStreakDays ?? 0} />
      </div>

      {todaySessions.length > 0 && (
        <div className="mb-4">
          <TodaySummary sessions={todaySessions} />
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">This week</div>
        <WeekChart sessions={last7} />
      </div>

      {recent.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-text-muted">Recent</div>
            <Link href="/sessions" className="text-xs text-accent">View all</Link>
          </div>
          <div className="divide-y divide-border">
            {recent.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-8">
          <button
            onClick={() => setFormOpen(true)}
            className="bg-accent text-base px-6 py-3 rounded-full font-medium"
          >
            Start your first session
          </button>
        </div>
      )}

      <SessionForm
        open={formOpen}
        onSave={handleSave}
        onCancel={() => setFormOpen(false)}
      />
    </motion.div>
  );
}
```

- [ ] **Step 4: Verify dev runs and shows populated dashboard**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run dev` → visit `/` → tap "Start your first session" → modal opens, fill form, save → Home shows streak flame (1 day), today summary, week chart bar for today, recent session in feed. Kill server.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: populated dashboard with today summary + week chart + recent feed" }
```

---

## Task 8: Session detail (read/edit/delete) + FAB wiring

**Files:**
- Create: `src/app/(main)/sessions/[id]/page.tsx`
- Modify: `src/app/(main)/layout.tsx` (FAB opens SessionForm globally)

**Interfaces:**
- Produces: `/sessions/[id]` page showing full session with edit/delete buttons. FAB at bottom-right opens the New Session form from any tab.

- [ ] **Step 1: Session detail page**

Create `src/app/(main)/sessions/[id]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSessions } from '@/hooks/useSessions';
import { SessionForm } from '@/components/session/SessionForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils/format';

const RATING_EMOJI: Record<number, string> = {
  5: '😄', 4: '🙂', 3: '😐', 2: '😕', 1: '😢',
};

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, updateSession, deleteSession } = useSessions();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const session = sessions.find((s) => s.id === params.id);
  if (!session) {
    return (
      <div className="text-text-muted text-sm">
        Session not found.{' '}
        <button onClick={() => router.push('/sessions')} className="text-accent">
          Back to list
        </button>
      </div>
    );
  }

  async function handleDelete() {
    await deleteSession(session!.id);
    setDeleteOpen(false);
    router.push('/sessions');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-4xl">{RATING_EMOJI[session.rating]}</div>
          <h1 className="font-serif text-2xl mt-2">
            {session.durationMinutes != null
              ? formatDuration(session.durationMinutes)
              : `${session.reps} reps`}
          </h1>
          <div className="text-text-muted text-sm">
            {session.startedAt.toLocaleString([], {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </div>
        </div>
        {session.activityLabel && (
          <span className="text-xs bg-surface-2 px-3 py-1 rounded-full text-text-muted">
            {session.activityLabel}
          </span>
        )}
      </div>

      {session.note && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Note</div>
          <p className="text-text whitespace-pre-wrap">{session.note}</p>
        </Card>
      )}

      {session.coachComment && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
            Coach
          </div>
          <p className="text-text italic whitespace-pre-wrap border-l-2 border-accent pl-3">
            {session.coachComment}
          </p>
        </Card>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>
      </div>

      <SessionForm
        open={editOpen}
        initial={session}
        onSave={async (input) => {
          await updateSession({ id: session.id, patch: input });
          setEditOpen(false);
        }}
        onCancel={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete session?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire FAB to SessionForm**

Modify `src/app/(main)/layout.tsx` to use a global session-form state:

```tsx
'use client';

import { type ReactNode, useState } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';
import { SessionForm } from '@/components/session/SessionForm';
import { useSessions } from '@/hooks/useSessions';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [fabOpen, setFabOpen] = useState(false);
  const { createSession } = useSessions();

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={() => setFabOpen(true)} />
      <TabBar />
      <SessionForm
        open={fabOpen}
        onSave={async (input) => {
          await createSession(input);
          setFabOpen(false);
        }}
        onCancel={() => setFabOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + dev flow**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run dev` → visit `/` → tap FAB → form opens, save → session appears in feed. Tap a session row in `/sessions` → detail page opens → edit works → delete works. Kill server.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: session detail page + FAB wired to session form" }
```

---

## Task 9: Milestone celebration (basic)

**Files:**
- Create: `src/components/streak/MilestoneCelebration.tsx`
- Modify: `src/app/(main)/layout.tsx` to render it

**Interfaces:**
- Produces: full-screen confetti + one-liner when a streak milestone is crossed. Triggers on change in `streak.milestonesAchieved` length.

- [ ] **Step 1: MilestoneCelebration component**

Create `src/components/streak/MilestoneCelebration.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStreak } from '@/hooks/useStreak';

const COPY: Record<number, string> = {
  3: 'Three days. The shape is forming.',
  7: 'Seven days. One full week — the path finds its rhythm.',
  14: 'Fourteen days. Practice becomes pattern.',
  30: 'Thirty days. A month of showing up.',
  60: 'Sixty days. The arc is unmistakable.',
  90: 'Ninety days. A season of practice.',
  180: 'Half a year. The practice is you.',
  365: 'A full year. The first step was the whole path.',
};

const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = ['#F5A623', '#9CAF88', '#E85D75', '#6BB7D9', '#E6C99A'];

interface ConfettiPiece {
  id: number;
  x: number; // vw starting position
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 1.4,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    rotate: Math.random() * 720,
  }));
}

export function MilestoneCelebration() {
  const { streak } = useStreak();
  const [milestone, setMilestone] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [previousCount, setPreviousCount] = useState<number>(
    streak?.milestonesAchieved.length ?? 0
  );

  useEffect(() => {
    if (!streak) return;
    const current = streak.milestonesAchieved.length;
    if (current > previousCount) {
      const newMilestone = streak.milestonesAchieved[current - 1];
      if (newMilestone) {
        setMilestone(newMilestone);
        setConfetti(makeConfetti());
        // Vibrate (mobile).
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([60, 40, 60, 40, 120]);
        }
        const t = setTimeout(() => {
          setMilestone(null);
          setConfetti([]);
        }, 4000);
        setPreviousCount(current);
        return () => clearTimeout(t);
      }
    }
    setPreviousCount(current);
  }, [streak, previousCount]);

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-base/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            setMilestone(null);
            setConfetti([]);
          }}
        >
          {/* Confetti */}
          {confetti.map((c) => (
            <motion.div
              key={c.id}
              className="absolute w-2 h-3"
              style={{ backgroundColor: c.color, left: `${c.x}vw`, top: '-5vh' }}
              initial={{ y: 0, rotate: 0, opacity: 1 }}
              animate={{ y: '110vh', rotate: c.rotate, opacity: [1, 1, 0] }}
              transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
            />
          ))}

          {/* Center text */}
          <motion.div
            className="text-center px-8"
            initial={{ scale: 0.8, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18 }}
          >
            <div className="text-6xl mb-4">🔥</div>
            <div className="font-serif text-5xl text-accent mb-2">{milestone}</div>
            <div className="text-text-muted uppercase tracking-widest text-sm mb-4">
              day streak
            </div>
            <p className="font-serif text-xl text-text italic max-w-xs mx-auto">
              {COPY[milestone] ?? `${milestone} days. Well done.`}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add to main layout**

Modify `src/app/(main)/layout.tsx`:

```tsx
'use client';

import { type ReactNode, useState } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';
import { SessionForm } from '@/components/session/SessionForm';
import { MilestoneCelebration } from '@/components/streak/MilestoneCelebration';
import { useSessions } from '@/hooks/useSessions';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [fabOpen, setFabOpen] = useState(false);
  const { createSession } = useSessions();

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={() => setFabOpen(true)} />
      <TabBar />
      <SessionForm
        open={fabOpen}
        onSave={async (input) => {
          await createSession(input);
          setFabOpen(false);
        }}
        onCancel={() => setFabOpen(false)}
      />
      <MilestoneCelebration />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: milestone celebration overlay with confetti" }
```

---

## Task 10: Final Wave 2 verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass (Wave 1 + Wave 2 — should be 29+ tests).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: succeeds with routes including `/sessions/[id]`.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Verify:
- `/` shows greeting + streak (0) + empty state OR populated dashboard if sessions exist
- Tap FAB → modal opens with Timed/Reps toggle
- Start timer, let it run ~5s, stop, fill rating + label, save
- Session appears in Home "Recent" + in `/sessions` list + streak flame shows 1
- Tap a session row → detail page opens → edit works, delete works
- Create 3 sessions across 3 days (manually edit startedAt in dev tools if needed) → milestone celebration fires for day 3
- All 5 tabs still navigate correctly

- [ ] **Step 5: Commit if any final tweaks were made**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 2 final verification" } }
```

---

## Wave 2 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all tests pass (29+ tests: Wave 1's 15 + Wave 2's 14+)
- [ ] `npm run build` succeeds
- [ ] Sessions can be created via FAB → form (timed + reps both work)
- [ ] Sessions appear in `/sessions` list grouped by day
- [ ] Session detail at `/sessions/[id]` shows full info + edit + delete
- [ ] Streak updates correctly after each save (1-day grace window works)
- [ ] Dashboard shows today summary + week chart + recent 3
- [ ] Milestone celebration fires for day 3, 7, etc. (no duplicate celebrations)
- [ ] All 5 tabs navigate correctly
- [ ] All commits made with conventional-commit prefixes

## What's Next (Subsequent Waves)

- **Wave 3: LLM stack** — Port dharma-vicaya adapters (11 providers, 3 adapter classes, factory), coach comment generation after each save, weekly reflection feature, smart label suggestion. Updates SessionForm to surface "Coach is thinking…" placeholder.
- **Wave 4: Calendar** — GIS OAuth, calendar sync queue, per-save export.
- **Wave 5: Polish** — Athena unlock mechanic (7-tap streak flame), LLM provider settings UI in `/llm` tab, Lighthouse pass to ≥80, error states, empty state refinement.
