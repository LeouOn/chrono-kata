# T2: Morning check-in UI

**Depends on:** T1. **Blocks:** T5.

## Why
A check-in only gets done if it's quicker than making tea. Aim for four taps, then done.

## Scope
1. `src/hooks/useCheckIns.ts`: React Query hooks `useCheckIn(date)`, `useCheckInRange(from, to)`, and `useUpsertCheckIn()`. Invalidate on upsert, following the patterns in `useHabits.ts` / `useSessions.ts`.
2. `src/components/checkin/MorningCheckIn.tsx`:
   - Four rows (energy, fog, aches, sleep), each 1–5. Reuse `DotsRatingPicker` or `RatingControl` from `components/session/`.
   - Label the poles on each row so the direction is obvious (e.g. "Fog: clear … heavy").
   - An optional collapsible note.
   - Save automatically once all four are set. No separate submit step unless a note is open.
3. **Home** (`src/app/(main)/page.tsx`): show the card at the top until today's check-in exists. Afterwards, collapse it to a one-line summary ("Energy 3 · Fog 2 · …") that expands to edit.
4. **Settings:** add an optional `showMorningCheckIn` flag (default true) on `SettingsSchema`. It's non-indexed, so no Dexie bump is needed. Add the toggle to the settings page.
5. Add `hasCheckInToday` to any existing "today summary" only if that's trivial. Don't redesign the home screen.

## Acceptance
- Component tests: tapping four values persists them, the collapsed state shows after save, and editing updates rather than duplicates.
- Playwright `tests/e2e/morning-checkin.spec.ts`: fill in the check-in, reload, see the summary, and edit one value.
- Works at 400px width, with at least 44px tap targets.

## Out of scope
Recommendations and coach text (T5), and streak effects (T6).
