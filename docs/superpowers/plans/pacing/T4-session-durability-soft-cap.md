# T4: Session timer durability, soft cap, notifications

**Depends on:** nothing. **Blocks:** T8 (both touch `SessionForm.tsx`).

## Why
- Android can kill the WebView while a session is running. The start time lives only in React state (`SessionForm.tsx:48`), so the session is lost.
- For boom-bust pacing, a *ceiling* matters as much as a target. Stopping at the cap should count as success.

## Scope

### Durability
- Persist the running session timer (`startedAt` epoch ms + the form draft fields that matter) to localStorage under e.g. `chrono-kata-session-timer`, the same way `src/lib/timers/habit-timer.ts` does.
- On mount, restore it: if a running timer exists, reopen the session form with the timer running. Clear it on save, discard, or reset.
- Unit-test the storage module. Add an E2E test: start the timer, reload the page, and check the timer is still running with the right elapsed time.

### Soft cap
- Add an optional `softCapMinutes` (positive, ≤ 600) to `KataTemplate` (`src/lib/schemas/kata-template.ts`), editable in `KataTemplateSettings.tsx`. It's non-indexed, so no Dexie bump is needed.
  - T3 also adds `intensity` here. Whoever merges second rebases.
- When a session started from a template reaches the cap, show a gentle, non-modal prompt: "That's your cap for today. A good place to stop." Offer **Stop here** and **Keep going** buttons, with no nagging after that.
- Add an optional `stoppedAtCap?: boolean` on Session. Set it when the user stops within ±1 minute after the cap prompt. It's non-indexed.
- The bell/audio (`lib/audio/bell-synthesizer.ts`) may chime once at the cap.

### Native notifications and keep-awake
- Add `@capacitor/local-notifications`. When a session starts on native with a cap, schedule a notification for the cap time, and cancel it on stop or discard. Request permission lazily on first use.
- Keep-awake while `StretchRoutine` is active: evaluate `@capacitor-community/keep-awake` for Capacitor 8 compatibility. If no compatible plugin exists, use the Screen Wake Lock API (`navigator.wakeLock`) on both web and native.
- Run `npx cap sync android`. Note any Android manifest changes in the PR.

## Acceptance
- A reload mid-session keeps the session.
- The cap prompt appears once at the cap, and `stoppedAtCap` is recorded correctly (unit test the rule).
- The notification is scheduled and cancelled (mock the plugin in Vitest).
- The web build is unaffected when the plugins are unavailable. Guard with `Capacitor.isNativePlatform()`.

## Out of scope
Showing cap success in insights (T10).
