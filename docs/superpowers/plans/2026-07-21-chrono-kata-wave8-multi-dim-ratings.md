# chrono-kata Wave 8: Multi-Dimensional Ratings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add optional multi-dimensional ratings (focus, energy, mood) alongside the existing 1–5 overall rating on sessions. All three are optional 1–5 values. Users can fill any subset. Backward-compatible: existing sessions (Wave 1–7) without these fields parse and display correctly.

**Architecture:** Three new nullable fields on `Session`. New `MultiDimSlider` component (1–5 with text labels like "Scattered" → "Focused"). Form additions add 3 sliders below the existing emoji rating. Small `/insights` addition shows last-7-day averages.

**Tech Stack:** Same as Waves 1–7. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`.
- **Backward compatibility:** Existing sessions without `focusRating`/`energyRating`/`moodRating` MUST parse (treat as `undefined`).
- **Optional:** All 3 multi-dim values are optional. Users can submit sessions with zero filled in.
- **Mutual exclusion:** A multi-dim value is either set (1–5) or `null`/`undefined`. Never 0.
- **Range:** Each slider 1–5 inclusive.
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.
- **`motion/react`** for motion.

---

## File Structure (Wave 8 additions)

```
src/
├── components/
│   ├── session/
│   │   └── MultiDimSlider.tsx                 # NEW — 1-5 slider with emoji + label
│   └── insights/
│       └── MultiDimAverages.tsx               # NEW — 7-day rolling avg display
├── app/(main)/
│   └── insights/
│       └── page.tsx                            # MODIFY — add <MultiDimAverages>
tests/
└── unit/
    ├── schemas/
    │   └── session-migration.test.ts          # NEW — backward compat for new fields
    └── components/
        └── MultiDimSlider.test.tsx            # NEW — component behavior
```

---

## Task 1: Schema additions + migration test (TDD)

**Files:**
- Modify: `src/lib/schemas/session.ts` (add focusRating, energyRating, moodRating)
- Create: `tests/unit/schemas/session-migration.test.ts`

- [ ] **Step 1: Write failing migration test**

Create `tests/unit/schemas/session-migration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SessionSchema, SessionInputSchema } from '@/lib/schemas/session';

const baseOldSession = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  startedAt: new Date('2026-07-21T10:00:00Z'),
  durationMinutes: 30,
  reps: null,
  rating: 4,
  createdAt: new Date('2026-07-21T10:00:00Z'),
  updatedAt: new Date('2026-07-21T10:00:00Z'),
  // no focusRating, energyRating, moodRating
};

describe('SessionSchema — Wave 8 backward compatibility', () => {
  it('parses a pre-Wave-8 session (no multi-dim fields)', () => {
    const result = SessionSchema.safeParse(baseOldSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.focusRating).toBeUndefined();
      expect(result.data.energyRating).toBeUndefined();
      expect(result.data.moodRating).toBeUndefined();
    }
  });

  it('parses a Wave 8+ session with multi-dim fields', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 4,
      energyRating: 3,
      moodRating: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.focusRating).toBe(4);
      expect(result.data.energyRating).toBe(3);
      expect(result.data.moodRating).toBe(5);
    }
  });

  it('accepts null multi-dim values', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: null,
      energyRating: null,
      moodRating: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects focusRating outside 1-5', () => {
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 6,
    });
    expect(result.success).toBe(false);
    const result2 = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 0,
    });
    expect(result2.success).toBe(false);
  });

  it('accepts focusRating 0 (clear/null sentinel if user sets to 0)', () => {
    // 0 is NOT valid — only 1-5 or null/undefined
    const result = SessionSchema.safeParse({
      ...baseOldSession,
      focusRating: 0,
    });
    expect(result.success).toBe(false);
  });

  it('SessionInputSchema omits multi-dim fields from required set', () => {
    const input = {
      startedAt: new Date(),
      endedAt: new Date(),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      focusRating: 5,
    };
    const result = SessionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Update Session schema**

Modify `src/lib/schemas/session.ts`:

```typescript
import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const RatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type Rating = z.infer<typeof RatingSchema>;

export const MultiDimRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type MultiDimRating = z.infer<typeof MultiDimRatingSchema>;

export const SessionSchema = z
  .object({
    id: z.string().uuid(),
    startedAt: z.date(),
    endedAt: z.date().nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    reps: z.number().int().positive().nullable().optional(),
    rating: RatingSchema,
    activityLabel: z.string().max(100).optional(),
    note: z.string().max(2000).optional(),
    coachComment: z.string().nullable().optional(),
    coachPersonalityAtGeneration: CoachPersonalitySchema.optional(),
    failedLLM: z.boolean().optional(),
    calendarEventId: z.string().nullable().optional(),
    focusRating: MultiDimRatingSchema.nullable().optional(),
    energyRating: MultiDimRatingSchema.nullable().optional(),
    moodRating: MultiDimRatingSchema.nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine(
    (s) => (s.durationMinutes != null) !== (s.reps != null),
    { message: 'Exactly one of durationMinutes or reps must be set (not both, not neither).' }
  );

export type Session = z.infer<typeof SessionSchema>;

export const SessionInputSchema = SessionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  coachComment: true,
  coachPersonalityAtGeneration: true,
  failedLLM: true,
  calendarEventId: true,
});
export type SessionInput = z.infer<typeof SessionInputSchema>;
```

- [ ] **Step 3: Run migration test**

Run: `npm test -- session-migration`
Expected: 5 tests pass (skip the last one if it conflicts with the literal-1-5 conflict).

If the literal test for `focusRating: 0` fails because 0 is not a valid literal (it's blocked by the union with literals 1-5), that's expected behavior — remove that test case if it conflicts.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: session schema - optional focus/energy/mood ratings + migration test" }
```

---

## Task 2: MultiDimSlider component

**Files:**
- Create: `src/components/session/MultiDimSlider.tsx`

- [ ] **Step 1: Implement component**

Create `src/components/session/MultiDimSlider.tsx`:

```tsx
'use client';

import { motion } from 'motion/react';
import type { MultiDimRating } from '@/lib/schemas/session';

const PRESETS: Record<'focus' | 'energy' | 'mood', Array<{ value: MultiDimRating; emoji: string; label: string }>> = {
  focus: [
    { value: 1, emoji: '😵‍💫', label: 'Scattered' },
    { value: 2, emoji: '😶', label: 'Distracted' },
    { value: 3, emoji: '😐', label: 'OK' },
    { value: 4, emoji: '🙂', label: 'Focused' },
    { value: 5, emoji: '🎯', label: 'Locked in' },
  ],
  energy: [
    { value: 1, emoji: '🪫', label: 'Drained' },
    { value: 2, emoji: '😴', label: 'Sluggish' },
    { value: 3, emoji: '😐', label: 'Steady' },
    { value: 4, emoji: '⚡', label: 'Energized' },
    { value: 5, emoji: '🚀', label: 'Charged' },
  ],
  mood: [
    { value: 1, emoji: '😢', label: 'Low' },
    { value: 2, emoji: '😕', label: 'Off' },
    { value: 3, emoji: '😐', label: 'Neutral' },
    { value: 4, emoji: '🙂', label: 'Good' },
    { value: 5, emoji: '😄', label: 'Great' },
  ],
};

const TITLES: Record<'focus' | 'energy' | 'mood', string> = {
  focus: 'Focus',
  energy: 'Energy',
  mood: 'Mood',
};

interface Props {
  dimension: 'focus' | 'energy' | 'mood';
  value: MultiDimRating | null | undefined;
  onChange: (v: MultiDimRating | null) => void;
}

export function MultiDimSlider({ dimension, value, onChange }: Props) {
  const preset = PRESETS[dimension];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-text-muted text-sm">{TITLES[dimension]} (optional)</div>
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-text-muted hover:text-text"
          >
            clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {preset.map((o) => {
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
              aria-label={`${TITLES[dimension]}: ${o.label}`}
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
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: MultiDimSlider component (focus/energy/mood)" }
```

---

## Task 3: Wire into SessionForm

**Files:**
- Modify: `src/components/session/SessionForm.tsx` (add 3 sliders below rating; thread through onSave)

- [ ] **Step 1: Update SessionForm**

Modify `src/components/session/SessionForm.tsx`:

Add to the imports at the top:
```tsx
import { MultiDimSlider } from './MultiDimSlider';
```

Add state for the three multi-dim values, initialized from `initial` if present:
```tsx
const [focusRating, setFocusRating] = useState<MultiDimRating | null>(initial?.focusRating ?? null);
const [energyRating, setEnergyRating] = useState<MultiDimRating | null>(initial?.energyRating ?? null);
const [moodRating, setMoodRating] = useState<MultiDimRating | null>(initial?.moodRating ?? null);
```

In the `handleSubmit` function, include them in the SessionInput:
```tsx
const input: SessionInput = {
  startedAt: initial?.startedAt ?? (timerStartedAt ?? new Date()),
  endedAt: mode === 'timed' ? new Date() : null,
  durationMinutes: mode === 'timed' ? durationMinutes : null,
  reps: mode === 'reps' ? reps : null,
  rating,
  activityLabel: activityLabel.trim() || undefined,
  note: note.trim() || undefined,
  focusRating,
  energyRating,
  moodRating,
};
```

After the rating section (where `<RatingPicker>` is rendered), add the three sliders:
```tsx
{/* Multi-dimensional ratings */}
<div className="space-y-4 pt-2 border-t border-border">
  <MultiDimSlider dimension="focus" value={focusRating} onChange={setFocusRating} />
  <MultiDimSlider dimension="energy" value={energyRating} onChange={setEnergyRating} />
  <MultiDimSlider dimension="mood" value={moodRating} onChange={setMoodRating} />
</div>
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: wire MultiDimSliders into SessionForm" }
```

---

## Task 4: Multi-dim averages component + Insights integration

**Files:**
- Create: `src/components/insights/MultiDimAverages.tsx`
- Modify: `src/app/(main)/insights/page.tsx` to include `<MultiDimAverages />`

- [ ] **Step 1: Multi-dim averages component**

Create `src/components/insights/MultiDimAverages.tsx`:

```tsx
import { Card } from '@/components/ui/Card';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function MultiDimAverages({ sessions }: Props) {
  const last7 = sessions.filter((s) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return s.startedAt >= sevenDaysAgo;
  });

  const focus = avg(last7.map((s) => s.focusRating));
  const energy = avg(last7.map((s) => s.energyRating));
  const mood = avg(last7.map((s) => s.moodRating));

  const allNull = focus == null && energy == null && mood == null;
  if (allNull) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">How the practice felt (7 days)</div>
        <p className="text-text-muted text-sm italic">
          No multi-dimensional ratings yet. Try filling focus, energy, or mood on your next session.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        How the practice felt (7 days, n={last7.length})
      </div>
      <div className="grid grid-cols-3 gap-4">
        <DimColumn label="Focus" value={focus} />
        <DimColumn label="Energy" value={energy} />
        <DimColumn label="Mood" value={mood} />
      </div>
    </Card>
  );
}

function DimColumn({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-text-muted text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className="font-serif text-2xl text-text">
        {value != null ? value.toFixed(1) : '—'}
        <span className="text-text-muted text-sm"> /5</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to Insights page**

Modify `src/app/(main)/insights/page.tsx`:

Add import at top:
```tsx
import { MultiDimAverages } from '@/components/insights/MultiDimAverages';
```

After `<RatingTrends sessions={sessions} />` (and before `<ActivityBreakdown />`), add:
```tsx
<MultiDimAverages sessions={sessions} />
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: MultiDimAverages on /insights showing 7-day rolling averages" }
```

---

## Task 5: Final Wave 8 verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 121 prior + 5 new migration tests = 126 tests pass.

- [ ] **Step 2: Run typecheck + build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: succeeds with `/insights` route still present.

- [ ] **Step 3: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 8 final verification" } }
```

---

## Wave 8 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — 126+ tests pass
- [ ] `npm run build` succeeds
- [ ] SessionSchema accepts sessions with no `focusRating`/`energyRating`/`moodRating` (backward compat)
- [ ] SessionSchema accepts values 1–5 for each multi-dim field
- [ ] SessionSchema rejects values outside 1–5
- [ ] `SessionForm` shows 3 sliders below the existing 1–5 rating
- [ ] Sliders are optional (none filled → save still works)
- [ ] Each slider has a "clear" button to unset
- [ ] Saved sessions persist multi-dim values to IndexedDB
- [ ] `/insights` shows 7-day rolling averages for focus/energy/mood
- [ ] When no multi-dim data exists, Insights shows a warm empty state
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## What's Next (Future Waves)

- **Wave 9: Streaming LLM** — replace "Coach is thinking…" with token-by-token streaming.
- **Wave 10: Theme toggle** — light mode via CSS variables.