# T6: Recovery-mode streaks

**Depends on:** T1, and T3 for the low-energy threshold constant. Hard-code it and switch to T3's value if T3 isn't merged yet.

## Why
Streaks reward pushing on a bad day, which is exactly what drives boom-bust cycles. In recovery, showing up to check in *is* the practice.

## Scope
- Setting: an optional `recoveryMode: boolean` (default false) plus `lowEnergyRestThreshold: 1|2|3` (default 2) on `SettingsSchema`. Add the toggle to `src/components/settings/GoalSettings.tsx`, with one line of explanation.
- `src/lib/streak/compute-streak.ts`: extend `ComputeStreakArgs` with optional `checkInDays?: Set<string>` and `lowEnergyDays?: Set<string>`. When recovery mode is on:
  - A day with a check-in counts as a streak day, just like a session.
  - A day in `lowEnergyDays` is exempt, like a rest day: it neither breaks the streak nor spends a freeze token.
  - **Don't change the freeze fixed-point algorithm.** Add these as extra conditions in the walk, alongside `restDaySet`.
- `src/hooks/useStreak.ts`: load check-ins for the relevant window, build the sets, and pass them in.
- UI copy: on a low-energy day, the home streak area says "Rest day. Your body asked for it." instead of anything that implies a miss.

## Acceptance
- New cases in the existing streak tests:
  - recovery off → behavior unchanged (all existing tests pass untouched)
  - a check-in-only day keeps the streak
  - a low-energy day doesn't consume a freeze token
  - mixed rest days + low-energy days + freezes
  - repeated calls are idempotent (the existing fixed-point property)
- Low-energy days are determined from the local `date` key, never from a timestamp.

## Out of scope
Changing milestones, and changing freeze token economics.
