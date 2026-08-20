# Wave 15 Plan — Habit Goals, Daily Progress Rings & Streak Protection

**Date:** 2026-07-27
**Status:** Approved for Implementation

---

## 1. Overview & Objectives

Wave 15 introduces target-driven habit tracking and compassionate streak retention:
1. **Habit Goals & Target Rings**:
   - Customizable daily time target (e.g. 20, 30, 45, 60 minutes/day).
   - Weekly practice session target (e.g. 4, 5, or 6 days/week).
   - Animated circular SVG progress ring on `TodaySummary` component visually filling as practice minutes accumulate.
2. **Streak Protection & Rest Day Grace System**:
   - Prevent streak burnout: designate weekly Rest Days (e.g., Saturday, Sunday).
   - Resting on configured rest days does not break an ongoing streak.
   - 1 Weekly Streak Freeze token (auto-recharges every 7 days) protecting against unplanned missed days.

---

## 2. Technical Architecture & Schemas

### 2.1 Settings Schema Extensions (`src/lib/schemas/settings.ts`)
```typescript
export const DayOfWeekSchema = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

// Extend SettingsSchema:
{
  dailyGoalMinutes: z.number().int().min(5).max(360).default(20),
  weeklyGoalDays: z.number().int().min(1).max(7).default(5),
  restDays: z.array(DayOfWeekSchema).default([]),
  streakFreezeTokens: z.number().int().min(0).max(2).default(1),
  lastStreakFreezeUsedAt: z.date().nullable().optional(),
}
```

### 2.2 Adaptive Streak Computation (`src/lib/streak/compute-streak.ts`)
Extend pure function `computeStreak(sessionDates, options)`:
- `options.restDays`: array of day-of-week strings that are ignored during streak gap checks.
- `options.streakFreezeTokens`: consumes a freeze token on a single missed active day rather than resetting the streak count.

---

## 3. Implementation Tasks

- [ ] **Task 1: Settings & Streak Schema Migration (TDD)**:
  - Add `dailyGoalMinutes`, `weeklyGoalDays`, `restDays`, `streakFreezeTokens` to `SettingsSchema`.
  - Update `computeStreak` with rest-day exemption and streak-freeze recovery.
  - Add comprehensive unit tests in `tests/unit/streak/streak-protection.test.ts`.

- [ ] **Task 2: Animated SVG Progress Ring Component**:
  - Create `src/components/dashboard/GoalProgressRing.tsx` with smooth stroke-dashoffset transitions.
  - Embed inside `TodaySummary.tsx` showing current vs target practice minutes.

- [ ] **Task 3: Goal & Rest Day Configuration UI in Settings**:
  - Add Daily Goal slider / preset selector (15m, 20m, 30m, 45m, 60m).
  - Add Day-of-week Rest Day toggle buttons (M T W T F S S).
  - Display Streak Freeze status indicator with recovery countdown.

- [ ] **Task 4: Verification & Quality Gates**:
  - Run typecheck, lint, and full test suite.
