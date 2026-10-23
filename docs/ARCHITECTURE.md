# Architecture — current state

Audited 2026-10-23 against `main` after PR #7. This document describes **what is
in the repo**, not what it could be. Everything here was read from source; file
paths are the evidence.

> **Two wave series exist.** `docs/superpowers/plans/` holds an **earlier**
> wave1–wave16 implementation series (waves 1–16, written incrementally in
> 2026-07/08) and its implementer reports. `chrono-kata-roadmap.md` (repo root)
> is a **different** 0–20 wave expansion roadmap written later, without repo
> access. They share numbering but not content. Roadmap notes go in
> `docs/waves/wave-NN.md`; do not add roadmap notes to `docs/superpowers/`.

## 1. What the app is

A local-first personal practice tracker: you log timed or repetition-based
sessions, rate them, keep habits and a streak, get a coach comment from an LLM
of your choice, and read insights over time. All data lives in the browser's
IndexedDB (Dexie); there is no account and no server-side database.

Stack (`package.json`): Next.js 15 (App Router) + React 19, TypeScript 5.9,
Tailwind CSS 4, Dexie 4, TanStack React Query 5, Zod 3, `motion` for animation,
Capacitor 8 (Android shell), `@serwist/next` for the web service worker,
Vitest 2 + Testing Library for unit tests, Playwright for e2e.

## 2. Runtime topology

- **Web:** Next.js app. Everything except the dev-only API route renders from
  the client; pages are client components that read Dexie through hooks.
- **Android:** Capacitor shell (`capacitor.config.ts`, `android/`) loading a
  **static export** bundled into the APK (`webDir: 'out'`). `npm run
  build:android` (`scripts/build-android.mjs`) sets `NEXT_EXPORT=true`,
  temporarily stashes `src/app/api`, runs `next build`, and restores it.
- **Service worker:** `src/app/sw.ts` (Serwist) precaches the shell and sends
  `/api/local-ai` network-only. Registration is decided at runtime:
  `src/components/system/PlatformRuntime.tsx` registers it on web and
  **unregisters it on native**, then calls `navigator.storage.persist()`.
- **Backend:** none in production. `src/app/api/local-ai/route.ts` is a
  **development-only** proxy that exposes desktop `.env` keys to a
  localhost-hosted web UI; it returns an empty provider map for non-local
  requests (`src/lib/llm/server/environment.ts`, `isLocalAIRequest`) and is
  removed from the static export entirely.

## 3. Routes

Under `src/app/` (App Router; `(main)` is a route group, not a URL segment):

| Route | File | Purpose |
|---|---|---|
| `/` | `(main)/page.tsx` | Home: greeting, morning check-in, habits, stretch routine, quick-start katas, today summary (streak flame, goal ring), week chart, recent sessions |
| `/sessions` | `(main)/sessions/page.tsx` | Session list grouped by day, new-session form |
| `/sessions/detail` | `(main)/sessions/detail/page.tsx` | Session detail + coach conversation thread; client component is Suspense-wrapped because it uses `useSearchParams` |
| `/reflect` | `(main)/reflect/page.tsx` | Weekly AI reflection list + "reflect on this week" |
| `/insights` | `(main)/insights/page.tsx` | Heatmap, yearly consistency matrix, activity breakdown, rating trends, multi-dimensional averages, load-response view |
| `/llm` | `(main)/llm/page.tsx` | Provider list/editor, token meter, local provider discovery |
| `/settings` | `(main)/settings/page.tsx` | Active coach, theme, reminders, kata templates, habits, goals, calendar, data transfer, confirmations, clear data |
| `/onboarding` | `onboarding/page.tsx` | One-time coach personality pick; writes `onboarding-completed` to localStorage |
| API | `api/local-ai/route.ts` | Dev-only: GET provider discovery, POST streaming passthrough |

`(main)/layout.tsx` adds the tab bar, floating action button (new session),
session form, milestone celebration, notification runner, and performs the
app-open side effects: recompute streak, flush pending calendar ops, reopen a
persisted running timer, rebuild habit logs once, and refresh the streak when
the local day rolls over while the app is open.

## 4. State management and data flow

There is no Redux/Zustand. Two layers:

1. **Persistence:** Dexie singleton `chrono-kata` (`src/lib/db/db.ts`), one
   repository per table in `src/lib/db/*.repo.ts` exposing typed async methods
   (see `docs/DATA_MODEL.md`).
2. **UI state:** TanStack React Query. The client is created once in
   `src/providers/QueryProvider.tsx` with `staleTime: 30_000` and
   `refetchOnWindowFocus: false`. Hooks in `src/hooks/` wrap query + mutation
   pairs; mutations invalidate their query keys and run fire-and-forget side
   effects.

Side effects after a session is saved (`src/hooks/useSessions.ts`):
optimistic insert, then on success — recompute + persist the streak, kick off
coach-comment generation (streamed into Dexie, not awaited), enqueue Google
Calendar sync (falls back to `pendingCalendarOps`), and sync habit logs.
Session creation also fires `syncHabitLogsForSession` and calendar sync in
separate modules; all three are idempotent.

Dialog/prompt state (open forms, confirmations) is local `useState` in
components. `src/hooks/useConversation.ts` and `sessionRepo.watch()` expose
Dexie `liveQuery` subscriptions for streaming coach text, which arrives as
repeated `messageRepo.update` writes rather than via React Query.

## 5. LLM provider abstraction and the coach

Directory: `src/lib/llm/`.

- **Interface** (`types.ts`): `LLMProvider.completeSingle({userText,
  systemPrompt, signal})` plus optional `stream()` and `chatWithTools()` (the
  latter reserved, unimplemented). Responses are `ChatResponse` with
  `content`, `stopReason` (`EndTurn | MaxTokens | Error`), optional `thinking`
  and `usage`. Failures are `LLMException` with `LLMExceptionKind`
  (`authFailed | rateLimited | timeout | offline | provider | unknown`).
- **Adapters:** `openai-compatible-provider.ts` (default for openai, deepseek,
  deepseek-pro, openrouter, zai, minimax, nemotron, ollama, and any unknown
  name), `claude-provider.ts`, `gemini-provider.ts`. Selected by
  `createLLMProvider()` in `provider-factory.ts` from a `ProviderConfig`
  (`providerName`, `baseUrl`, `apiKey`, `model`, `credentialSource`).
- **Transport:** `provider-fetch.ts` (shared `fetch` + error mapping),
  `sse-parser.ts` (streaming), `error-mapper.ts`, `clean-response.ts`
  (strips model preamble/markdown, filters streaming text).
- **Presets:** `provider-defaults.ts` (names, default base URLs/models,
  `adapterFor`) and `provider-config.ts`.
- **Prompts:** `prompt-builders.ts` builds coach and weekly-reflection user
  text. Personality system prompts live in `src/lib/coaches/` (`zen`, `hype`,
  `analyst`, `buddy`, `athena`) behind `getCoachSystemPrompt()`, which appends
  the `PACING_CLAUSE` (never encourage pushing through fatigue; phrase the
  given action, do not change it).
- **Pacing payload (`pacing-context.ts`, added by T5):** `buildPacingContext()`
  calls `recommend()` and assembles only what the coach may see — action, pct,
  reasons, 7-day load and previous 7-day load, the recent check-ins, streak
  days, rest-day flag and recent session lines (label/minutes/rating, no ids
  and no notes). `buildDailyBriefingUserText()` serializes it;
  `hashPacingContext()` keys the briefing cache.
- **`athena-persona.ts` is gitignored**; `athena-persona.ts.example` is
  committed and `scripts/ensure-athena-persona.mjs` (wired to `postinstall`
  and the `pre*` scripts) copies it into place on demand when the real file is
  absent. See `docs/TOOLING.md`.
- **Service layer:** `llm-service.ts` (`generateCoachComment`,
  `generateCoachCommentStream`, weekly reflection, daily briefing) applies a
  30 s timeout, combines abort signals, and maps errors to `LLMException`.
- **Daily briefing guard (T5b):** `clean-response.ts` strips `<think>` blocks
  (and partial ones while streaming) and quotes, then `parseCoachBriefing()`
  parses a fenced-or-bare JSON object against a Zod schema (`summary`,
  `suggestion`, `tone`), rejects suggestions that contradict a rest/reduce
  decision, and otherwise returns a deterministic per-action fallback
  (`fallbackBriefing`) so the UI always has text. The rules decision is never
  the model's to make.
- **Settings & secrets:** `llm-settings` rows hold one entry per provider
  (`baseUrl`, `model`, `apiKey`, optional `credentialSource`) plus a monthly
  token counter. Exports blank `apiKey`; imports keep locally stored keys when
  the file has none. Keys for `credentialSource: 'environment'` never enter
  IndexedDB.
- **Local desktop discovery:** `local-discovery.ts` asks `/api/local-ai` on
  localhost for env-provided providers (3 s timeout, 15 s cache).

Coach output pipeline (session save): conversation row → root user message →
empty assistant placeholder → streamed tokens update the placeholder and the
session's `coachComment` → final message stores provider, model, personality,
tokens, latency, system prompt and raw prompt → token counter increments. On
failure the session is marked `failedLLM` and a toast is shown (suppressed
offline). The message tree (`parentId`) supports branching; the UI reads it in
`useConversation`/`components/session/ConversationThread.tsx`.

## 6. Timer engine

`src/lib/timers/`.

- **Session timer** (`session-timer.ts`): the running draft (mode, target
  duration/reps, activity label, note, template id, soft cap state,
  `startedAtMs`) is persisted to `localStorage` under
  `chrono-kata-session-timer`, so a reload restores the running timer. Elapsed
  time is always computed from `startedAtMs`, never accumulated by ticks.
  `stoppedAtCap()` derives the "stopped at the soft cap" flag from the cap
  prompt state and elapsed minutes.
- **Soft cap** (`cap-notification.ts`): on native, schedules a
  `@capacitor/local-notifications` notification at the cap time (no-op on web
  and when the time has passed); cancels it when the session ends early.
- **Habit timer** (`habit-timer.ts`): a small external store (listeners) plus
  `localStorage`, holding per-habit accumulated time and `runningSinceMs`,
  writing habit logs as time accrues.
- **Screen wake lock** (`src/lib/device/wake-lock.ts`): browser Wake Lock API
  (a Capacitor keep-awake plugin with Capacitor 8 support did not exist at the
  time).

## 7. Habit and streak logic

Habits (`src/lib/habits/`, `src/lib/schemas/habit.ts`):

- A `Habit` is `timed | boolean | count`, with a `daily | weekdays` schedule,
  optional `targetPerDay`, optional link to an activity label and/or a kata
  template id, an order, and an archive timestamp.
- `schedule.ts` answers "is it due today" and aggregates a day's logs into
  `{value, target, complete}`; `normalizeActivityName()` is the canonical
  label normalizer used by migrations and links.
- `today.ts` holds local-date helpers for the Today panel.
- `session-sync.ts` derives habit logs from saved sessions; matching prefers
  `linkedKataTemplateId` and falls back to the label. Idempotent per
  (habit, session); count habits are never auto-filled by sessions.

Streak (`src/lib/streak/`):

- `compute-streak.ts` walks backwards day by day from today over the session
  days. Missing days are handled in order: recovery-mode low-energy day
  (exempt like a rest day), recovery-mode check-in day (counts as a practice
  day), today (one-day grace), configured rest day (exempt), already-covered
  freeze day, spend a freeze token, otherwise break. The freeze-set walk is
  iterated to a fixed point so one call equals repeated calls; tokens for
  dates that no longer protect a live streak are refunded. `checkInDays` and
  `lowEnergyDays` are ignored unless `recoveryMode` is true.
- `milestones.ts` defines 3/7/14/30/60/90/180/365 and the crossing check used
  by `MilestoneCelebration`.
- The streak is a **derived cache** in the `streak` singleton table;
  `recomputeStreakSideEffect()` in `useSessions.ts` recomputes it after every
  session mutation and on app open. `useStreak.ts` reads it.

## 8. Kata templates and the stretch routine

- `KataTemplate` (`src/lib/schemas/kata-template.ts`): name, `timed | reps`
  mode, default duration/reps, optional soft cap, activity label, intensity
  (1–3, used by the pacing load model), default note, icon, order.
  `DEFAULT_KATA_TEMPLATES` seeds Morning Zazen, Deep Work Sprint and Kata Reps.
- Repositories: `src/lib/db/kata-template.repo.ts`; UI in
  `components/kata/KataQuickStart.tsx` and
  `components/settings/KataTemplateSettings.tsx`.
- `src/lib/kata/stretch-routine.ts` defines the built-in 7-hold, ~3½-minute
  stretch routine shown on Home; each hold saves a fractional-minute session.
  `src/lib/kata/icons.ts` lists the template icon choices.
- Sessions carry `kataTemplateId` (Dexie v6 index) and habits may carry
  `linkedKataTemplateId`, so renaming a template does not break the link.

## 9. Pacing and check-ins (the most recent feature area)

- `MorningCheckIn` (components/checkin) writes one `checkIn` row per local day:
  1–5 energy, fog, aches, sleep, optional note.
- The pacing decision is made by rules and only phrased by the model:
  `recommend()` returns the action, `pacing-context.ts` builds the payload, and
  the LLM must phrase it (validated, with fallback — see §5). The Home
  `DailyBriefingCard` shows the summary/suggestion, and the LLM settings page
  has a "What gets sent" panel (`components/llm/WhatGetsSent.tsx`) that prints
  the exact briefing payload.
- `src/lib/pacing/` is pure logic: `days.ts` (local date keys, `addDays`),
  `load.ts` (session → weighted load-minutes: `minutes × intensity`, reps
  converted at `REP_MINUTES = 0.1`), `response.ts` (wellbeing score with
  weights 0.4/0.2/0.2/0.2, lagged pairs, Spearman/Pearson, envelope
  estimation), `recommend.ts` (rules-first `rest | reduce | hold | build`,
  first match wins, documented in its header), `seed-data.ts` (synthetic demo
  dataset for the insights view), `types.ts` (shared types/constants only).
- `src/lib/insights/load-response.ts` joins load + wellbeing for the
  Load-Response view; other insight modules (`breakdown`, `heatmap`, `trends`,
  `yearly-matrix`) are likewise pure functions over sessions.
- Recovery-mode streak behaviour is wired through settings
  (`recoveryMode`, `lowEnergyRestThreshold`) and `computeStreak`.

## 10. Calendar interop

`src/lib/calendar/`: `gis.ts` (Google Identity Services token flow),
`token-store.ts` (token persistence/refresh in the `tokens` table),
`client.ts` (Calendar REST calls), `sync.ts` (create/update/delete events for
timed sessions when `googleCalendarSyncEnabled` and a calendar id exist;
failures are enqueued into `pendingCalendarOps` and flushed on app open and
after sync). Reps-only sessions never sync. UI lives in
`components/calendar/CalendarSettings.tsx`.

## 11. Notifications, audio, theming, PWA

- Reminders: `src/lib/notifications/reminder.ts` decides whether a reminder
  should fire (time, enabled flag, last session date, 30-minute window);
  `components/system/NotificationRunner.tsx` and
  `hooks/useNotificationReminder.ts` drive it. `@capacitor/local-notifications`
  is also used for the session soft cap.
- Audio: `src/lib/audio/bell-synthesizer.ts` synthesizes bell/bowl/chime
  sounds with Web Audio (no audio assets).
- Theming: `components/system/ThemeScript.tsx` writes `data-theme` /
  `data-accent` before paint from localStorage; `ThemeApplier.tsx` keeps it in
  sync with settings. Colour tokens live in `src/app/globals.css` and must be
  registered in the `@theme inline` block (there is a test that enforces it:
  `tests/unit/theme/theme-tokens.test.ts`).
- PWA: manifest at `public/manifest.webmanifest`, service worker per §2,
  install prompt in `components/ui/PWAInstallPrompt.tsx`.

## 12. Build and test topology

- `npm run dev` / `npm run dev:local` (loads `.env` keys through
  `scripts/local-dev.mjs`), `npm run build`, `npm run start`.
- `npm run build:android` → static export into `out/`, which
  `npx cap sync android` copies into the APK.
- `npm run precommit` = typecheck + lint + unit tests. `npm run ci` adds the
  production build (see `docs/TOOLING.md`).
- Unit tests: `tests/unit/**` with Vitest (jsdom, `fake-indexeddb`, Testing
  Library). E2E: `tests/e2e/**` with Playwright against `next start`, whose port
  is `PLAYWRIGHT_PORT` (default 3008) so parallel runs on a shared host do not
  collide. `npm run ci` is the local gate (typecheck + lint + unit tests +
  production build + e2e); there is no remote CI workflow. Details, gaps and
  measured timings are in `docs/TOOLING.md`.

## 13. Findings worth knowing before later waves

These contradict or extend the roadmap; they are reported, not fixed, in Wave 0.

1. **Streak is a derived cache**, not an independent store: any wave that adds
   a "no guilt" streak surface must keep recomputing it from sessions +
   check-ins + settings, or it will drift.
2. **No global state library and no entity store layer beyond Dexie repos**;
   Wave 1's `Domain/Project/Task/...` entities would need their own Dexie
   version, repos and React Query hooks to match the existing style.
3. **Timers persist to `localStorage`, not Dexie**; a background-timer wave
   must keep the "elapsed from start timestamp" rule.
4. **The service worker is deliberately off on native** and the static export
   stashes `src/app/api`; any new API route breaks the Android build until it
   is likewise excluded.
5. **`/reflect` already ships an AI weekly reflection** (roadmap Wave 11/14
   overlap) and **`/insights` already ships heatmaps, trends and load-response**
   (roadmap Wave 13 overlap).
6. **Settings are a single `singleton` row with optional fields**; there is no
   `settings.flags.*` namespace that roadmap principle 8 assumes. Lead decision
   Q4 plans it as an optional, non-indexed field on that row before W5/W8/W16/W18
   (`docs/ROADMAP_STATUS.md`), which needs no Dexie version bump.
7. **The daily briefing is cached in `localStorage`** under
   `chrono-kata-briefing-<local date>-<personality>-<payload hash>`
   (`hooks/useDailyBriefing.ts`), so a changed pacing payload invalidates it;
   Wave 14's coach-modes work must extend that key shape rather than replace it
   with a per-date-only cache.
