# Roadmap status (Wave 0, part B)

Reconciliation of `chrono-kata-roadmap.md` (Waves 0–20 + stretch backlog) against the code that
actually exists.

- **Baseline:** `origin/main` @ `2dbe51a` ("test: repair two tests red on main (#7)").
- **Method:** read-only sweep of `src/`, `tests/`, `scripts/`, `capacitor.config.ts`, `android/`,
  `package.json`, `tsconfig.json`, plus named searches. Every **missing** verdict below names the
  search that returned 0 hits; every **exists/partial** verdict names the file, route, table or test.
- **Status legend:** `exists` (built and usable as the roadmap describes) · `partial` (some of it is
  built, or an adjacent thing exists) · `missing` (not built; search named).
- **Also in flight at baseline:** **T5** (pacing coach, g1, PR open) and **T9** (Android hardening,
  unclaimed). Both overlap roadmap waves — see [W14](#w14--ai-coach-upgrade-context-and-tools) and
  [W16](#w16--notifications-and-nudges)/[W17](#w17--android-native-polish).
- **Companion docs (same wave, other seat):** `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` and the CI
  script are being written by d1 on `roadmap/w00-audit`. This file does not repeat them.

## Baseline facts

| Fact | Evidence |
|---|---|
| 13 Dexie tables, versions 1→6 | `src/lib/db/db.ts` (sessions, reflections, streak, settings, llmSettings, pendingCalendarOps, tokens, conversations, messages, kataTemplates, habits, habitLogs, checkIns) |
| **Next free Dexie version is v7** | v5 = `checkIns`, v6 = `sessions.kataTemplateId` index (`db.ts`) |
| 10 route files (9 screens/API + the service worker) | `src/app/(main)/`: `/`, `/insights`, `/llm`, `/reflect`, `/sessions`, `/sessions/detail`, `/settings`; `/onboarding`; `/api/local-ai`; `src/app/sw.ts` |
| 78 unit test files / 526 tests, all green | `npx vitest run` on `2dbe51a` → `78 passed (78)`, `526 passed (526)` |
| 11 Playwright specs | `tests/e2e/*.spec.ts` |
| TypeScript strict on | `tsconfig.json` → `"strict": true` |
| Lint + typecheck + unit gate exists | `package.json` → `precommit` = `typecheck && lint && test` |
| **No CI workflow** | `ls -a .github` → no such directory |
| **No error boundary** | `find src -name "error.tsx"`, `grep -rIl "componentDidCatch"` → 0 hits |
| **No wave notes** | `ls docs/` → only `ANDROID_STUDIO_SETUP_HANDOFF.md` and `docs/superpowers/`; no `docs/waves/` |
| No feature flags | `src/lib/schemas/settings.ts` → no `flags` key |

---

## Summary

| Wave | Title | Status | Size | Lanes | Net-new core |
|---|---|---|---|---|---|
| W0 | Audit and baseline | partial (in flight) | S | A/D | CI workflow, wave notes, full fixtures |
| W1 | Unified data model (tasks/projects/domains) | missing | L | A | Domain/Project/Task/Block/DayPlan/Estimate + repos |
| W2 | Capture (the inbox) | missing | L | B | capture, parser, voice, share target, inbox |
| W3 | Next-action decomposition (AI) | missing | M | C | decomposition prompt/JSON/UI |
| W4 | Multi-model triangulation | missing | M | C | parallel calls, merge view, estimates |
| W5 | Local LLM backbone | partial | M | C | LM Studio, per-feature routing, budget |
| W6 | Daily planning (picks and capacity) | missing | L | A/B | capacity math, pick ranking, anchors |
| W7 | Time blocking and calendar view | missing | L | B | timeline, drag/resize, replan |
| W8 | Calendar interop (local-first) | partial (Google only) | M | C | ICS export/import, native calendar |
| W9 | Work block → timed session flow | partial | M | B | outcome + breadcrumb, session links |
| W10 | Long projects without heroic pushes | missing | M | B | cadence debt, stall detection, project page |
| W11 | Weekly review wizard | partial | M | B | wizard, Review entity, pause/resume |
| W12 | Journal and domain accountability | missing | M | B | journal, shutdown ritual, markdown export |
| W13 | Analytics and calibration | partial | M | A | estimate accuracy, calibration, CSV export |
| W14 | AI coach upgrade (context and tools) | partial | L | C | tool-calling, prompt library, modes |
| W15 | Practice and session modes | partial | M | B | focus guard, checklists, per-anchor modes |
| W16 | Notifications and nudges | partial | M | C | 5 reminder kinds, quiet hours, snooze |
| W17 | Android-native polish | partial | M | C/D | widget, ongoing notification, share sheet |
| W18 | Backup, export, optional sync | partial | M | A/C | encrypted backup, rotation, sync |
| W19 | UX, accessibility, performance | partial | M | B | palette, a11y gaps, perf budget |
| W20 | Hardening and release | partial | L | D | loop e2e, error boundary, integrity checker |

---

## W0 — Audit and baseline

**Status:** partial (in flight) · **Size:** S · **Lanes:** A/D · **Depends on:** —

**Evidence**
- Exists: Vitest (`vitest.config.ts`), `fake-indexeddb` (devDependency, used by DB tests), Playwright
  (`playwright.config.ts`, port 3008, `tests/e2e/`), ESLint (`eslint.config.mjs`, `npm run lint`),
  TypeScript strict (`tsconfig.json`), one-command local gate `npm run precommit`.
- Exists: fixture data — `src/lib/pacing/seed-data.ts` exports `generateDemoData()` /
  `DEFAULT_DEMO_DATA` (templates, sessions, check-ins) and a synthetic 90-day-style dataset.
- Exists: migration-test pattern — `tests/unit/db/migrations.test.ts` (frozen `HISTORICAL_STORES`
  snapshot per version) and `tests/unit/db/db-upgrade.test.ts` (v3→v4 preserves rows).
- Missing: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, CI script — `ls docs/` shows neither;
  d1 is producing them on `roadmap/w00-audit`.
- Missing: CI — `ls -a .github` → no such directory; the gate is local-only.
- Missing: wave notes — `ls docs/waves` → no such directory (shipped waves are documented in
  `docs/superpowers/plans/` instead).
- Missing: fixtures for the *whole* dataset — `seed-data.ts` covers pacing tables only, not
  sessions/reflections/habits/conversations as one export.

**Skip / extend / net-new**
- Skip: nothing — W0 is the baseline the rest of this document is measured against.
- Extend: reuse `seed-data.ts` as the fixture factory for W1's migration test; reuse the
  `HISTORICAL_STORES` snapshot pattern for every new Dexie version (add v7 there).
- Net-new: CI workflow, `docs/waves/wave-NN.md` convention, a full-dataset fixture export.

**Conflicts:** none. **Overlap:** d1 owns ARCHITECTURE/DATA_MODEL/CI (disjoint files).

---

## W1 — Unified data model for tasks, projects, domains

**Status:** exists (shipped 2026-10-23, PRs #14 + #19) · **Size:** L · **Lanes:** A (data) · **Depends on:** W0

**Evidence**
- Shipped: Zod schemas `domain`/`project`/`task`/`block`/`day-plan`/`estimate` in
  `src/lib/schemas/` (the work vocabulary; a task is never a session).
- Shipped: Dexie **v7** in `src/lib/db/db.ts` — six new tables (`domains`, `projects`, `tasks`,
  `blocks`, `dayPlans`, `estimates`) + `sessions.taskId`/`projectId` indexes; frozen
  `HISTORICAL_STORES` v6-delta + v7 rows in `tests/unit/db/migrations.test.ts`.
- Shipped: default-domain seeding (Trading, Practice, Career/Build, Life admin) on **both**
  paths — `on('populate')` for fresh installs and the v6→v7 upgrade — plus an idempotent
  `ensureDefaultDomains()` heal called from the main layout (from check-g's review).
- Shipped: repositories `domain/project/task/block/day-plan/estimate.repo.ts` with typed
  queries (by status/domain/project, stale-since via `touchedAt`/`lastTouchedAt`, task
  children, block overlap-range) and pure status transitions in `src/lib/tasks/transitions.ts`.
- Shipped: `Session` optional `taskId`/`projectId`/`blockId`; `Habit`/`KataTemplate` optional
  `domainId` (non-indexed, no extra version).
- Shipped: backup envelope carries the six tables as optional fields (envelope stays `version: 2`
  per the T1 ground rule); export/import round-trip tested, including legacy files without the keys.
- Migration evidence: the v6→v7 upgrade test loads a real v6 DB from `generateDemoData()` fixtures
  and proves row-for-row survival; independently verified at PR review with an all-tables
  deep-diff harness and a mutation test.

**Skip / extend / net-new**
- Skipped: practice re-modelling — practice (kata templates, habits, streaks, check-ins) keeps
  its own vocabulary and tables, per decision Q1.
- Extended: Session/Habit/KataTemplate links as above; `DayPlan` keyed by local day
  (`toLocalDateString`), same pattern as check-ins.
- Net-new: the six tables + repositories + transitions + seeding + envelope fields.

**Conflicts**
1. **Dexie version:** resolved as v7 (see above). The pacing ground rules still apply (see
   [Cross-cutting rules](#cross-cutting-rules-and-conflicts)).
2. **Domain naming:** kept — `Domain` is a life area; session labels stay `activityLabel`
   everywhere, including LLM payloads.

**Depends on / blocks:** blocks W2, W6, W7, W9, W10, W11, W12, W13, W14, W18 — all unblocked
as of this merge.

Wave note: [docs/waves/wave-01.md](waves/wave-01.md).

## W2 — Capture (the inbox)

**Status:** partial — the rule-based parser + bulk splitter (`src/lib/capture/`) and the capture
sheet, bulk preview, inbox and process mode (`/inbox`, behind the `taskInbox` flag, default off)
now ship; voice capture and the Android share target remain · **Size:** L · **Lanes:** B (UI) + C ·
**Depends on:** W1

**Evidence**
- Exists (adjacent): a global FAB — `src/components/ui/FAB.tsx`, mounted at
  `src/app/(main)/layout.tsx:65` — that opens the **practice session** form
  (`src/app/(main)/page.tsx` → `SessionForm`). Capture exists; it captures *sessions*, not tasks.
- Missing: `grep -rInE "inbox|quickCapture|quick-capture" src tests` → **0 hits**.
- Missing: rule-based parser — no parser module under `src/lib/`; nothing parses
  `~20m !high tomorrow @context` tokens.
- Missing: voice — `grep -rInE "SpeechRecognition|webkitSpeech" src tests` → **0 hits**; no
  `@capacitor-community/*` dependency in `package.json`.
- Missing: share target — `grep -rInE "navigator.share|share-target|ACTION_SEND" src tests` → **0 hits**;
  `capacitor.config.ts` declares no plugins and `android/app/src/main/java/com/chronokata/app/`
  contains only `MainActivity.java`.
- Missing: bulk paste, inbox screen, process mode — no route and no component.

**Skip / extend / net-new**
- Skip: nothing.
- Extend: the FAB already provides the "reachable from every screen" affordance; add a capture mode
  to it once `Task` exists rather than adding a second global button.
- Net-new: `Task`-based capture, the rule-based parser (≥30 table-driven tests per the roadmap),
  bulk paste with preview, voice capture, Android share target, inbox screen + process mode.

**Conflicts:** the roadmap's "global quick-capture" and the app's existing FAB both claim the same
screen corner — one button, two payloads (session vs task). Decide the priority order.

---

## W3 — Next-action decomposition (AI)

**Status:** missing · **Size:** M · **Lanes:** C · **Depends on:** W1 (tasks), W5 (local routing)

**Evidence**
- Exists: the provider adapter layer (`src/lib/llm/provider-factory.ts`,
  `openai-compatible-provider.ts`, `claude-provider.ts`, `gemini-provider.ts`) and a prompt builder
  module (`src/lib/llm/prompt-builders.ts`).
- Exists: the *pattern* the roadmap asks for is being landed by T5 — validated JSON + deterministic
  fallback + contradiction guard in `src/lib/llm/clean-response.ts` (`parseCoachBriefing`) and a
  zod-validated payload. Reuse it instead of inventing a second validation style.
- Missing: no decomposition flow — `grep -rInE "decompos|breakdown|break it down" src tests` matches
  only `src/lib/insights/breakdown.ts`, which is the *activity breakdown* chart (unrelated).
- Missing: no retry/repair re-prompt, no "this feels heavy" affordance, no subtask save.
- Exists: `zod` is already a dependency (`package.json`).

**Skip / extend / net-new**
- Skip: a new provider abstraction — the existing one is enough.
- Extend: `clean-response.ts` gains a second schema (`firstAction`, `firstActionMinutes`, `needs`,
  `steps`, `pitfalls`, `canSkipOrDoBadly`); the "re-prompt once with the validation error, then fall
  back to plain text" rule is a second pass in the same module.
- Net-new: decomposition prompt, the "break it down" UI, optional subtask save.

**Conflicts:** principle 6 ("AI proposes, user disposes") — the first AI *write* in the app would be
subtask creation, so the confirm/diff UI (W14) must exist before it, or subtasks stay manual.

---

## W4 — Multi-model triangulation

**Status:** missing · **Size:** M · **Lanes:** C · **Depends on:** W1 (Estimate)

**Evidence**
- Exists: 10 provider presets (`src/lib/llm/provider-defaults.ts`) and 3 adapter classes; a
  provider can be created on demand by `provider-factory.ts`.
- Exists: cost awareness — `src/components/llm/TokenMeter.tsx` (token/cost estimate for the month);
  `grep -rInE "\bestimates?\b" src` matches only that file.
- Missing: no parallel multi-provider call — `src/lib/llm/llm-service.ts` makes exactly one provider
  call per feature (`generateCoachComment`, `generateConversationReply`, `generateWeeklyReflection`,
  `suggestLabel`, `generateDailyBriefing`).
- Missing: no merge view, no spread (min/median/max) computation, no per-source estimate store.
- Missing: `grep -rInE "tool_choice|toolCalls?\b|function_call" src tests` → **0 hits** (also relevant
  to W14).

**Skip / extend / net-new**
- Skip: the provider registry.
- Extend: `provider-factory.ts` can be called N times; `TokenMeter` is the natural home for the
  "expected number of calls" / local-only guard.
- Net-new: `Estimate` rows with `source: 'user' | providerId`, the merge/agreement view, and the
  calibration storage that W13 then scores.

**Conflicts:** the roadmap puts `Estimate` in W1 but needs W4's provider set to populate `source`.
Either `source` accepts a single provider name until W4 lands, or W4's parallel-call slice moves
ahead of the analytics in W13.

---

## W5 — Local LLM backbone

**Status:** partial → mostly built (Wave 5: PR #21 LM Studio + local predicate, PR #22 private mode +
routing + context budget; wave note `docs/waves/wave-05.md`) · **Size:** M ·
**Lanes:** C · **Depends on:** —

**Evidence**
- Exists: a local provider preset — `ollama` → `http://localhost:11434/v1` in
  `src/lib/llm/provider-defaults.ts`; the OpenAI-compatible adapter serves any local
  OpenAI-shaped endpoint.
- Exists: desktop env-key discovery — `src/lib/llm/local-discovery.ts`, `src/app/api/local-ai/route.ts`,
  `scripts/local-dev.mjs` (loopback-only server, `NEXT_PUBLIC` keys excluded).
- Exists: the app is genuinely local-first — all data is in IndexedDB; only LLM calls leave the
  device, and with no provider configured the practice loop still works (the briefing card surfaces
  a plain error, sessions/habits/check-ins never touch the network).
- **Now exists (Wave 5):** LM Studio as a first-class provider (`lmstudio` preset,
  `http://localhost:1234/v1`) with a **host field**, a **model picker** fed by `GET /v1/models`
  and a **health check** next to "Test connection" (`src/components/llm/ProviderEditor.tsx`,
  `src/components/llm/ProviderList.tsx`, `src/lib/llm/local-models.ts`); one definition of "local"
  (`src/lib/llm/local-provider.ts`: local preset **or** loopback/RFC1918/link-local/mDNS address);
  **private mode enforced at the service and factory seam** so a non-local provider is refused
  before any fetch (`src/lib/llm/privacy.ts`, `src/lib/llm/app-state.ts`);
  **per-feature routing** on the settings row (`settings.llmRouting`, optional and non-indexed,
  no Dexie version) with named slots for W3/W4; a **context budget** that keeps whole items
  (`src/lib/llm/context-budget.ts`, one token ≈ four characters); and "What gets sent" now shows
  the provider and the private-mode state.
- Still missing: **the Android cleartext-LAN decision** — `android/` is untouched; the trade-off
  (narrow cleartext exception vs a TLS reverse proxy) is written up as a proposal in
  `docs/waves/wave-05.md` for the human. Also missing: which surfaces actually use the context
  budget (W3/W6 decide that), and LAN host auto-discovery.

**Skip / extend / net-new**
- Skip: a new provider class — the OpenAI-compatible adapter covers LM Studio.
- Extend: `provider-defaults.ts` gains an `lmstudio` preset; the LLM tab gains a host field, a
  model picker and a health check; the routing table lives on the settings row, not in
  `llmSettings`.
- Net-new (done): the local-provider predicate, private mode, routing, context budget, and the
  wave note. Net-new (open): the cleartext-LAN decision and per-surface budgets.

**Conflicts:** W5's "private mode → local only" and W4's "local only mode" are the same switch —
built once, as the `privateMode` flag (decision Q4). The routing table needed the flag mechanism
first, which is why it landed as a prerequisite (PR #15).


---

## W6 — Daily planning (picks and capacity)

**Status:** missing · **Size:** L · **Lanes:** A (math) + B (UI) · **Depends on:** W1, W2

**Evidence**
- Missing: no pick entity — `grep -rInE "\bpicks?\b" src tests` → 2 hits, both false positives
  (`src/hooks/useConversation.ts:357,361`, a variable named `pick`).
- Missing: no capacity math — `grep -rInE "\bcapacity\b" src tests` → **0 hits**.
- Missing: no anchors — `grep -rInE "\banchor" src tests` → **0 hits**; no recurring protected-window
  setting in `src/lib/schemas/settings.ts`.
- Exists (adjacent, different domain): the pacing engine decides *practice load*
  (`src/lib/pacing/recommend.ts` → rest/reduce/hold/build, `src/lib/pacing/load.ts`,
  `src/lib/pacing/response.ts`). It ranks nothing and schedules nothing.
- Exists (adjacent): a "Today" dashboard — `src/app/(main)/page.tsx` renders `TodaySummary`,
  `WeekChart`, `DailyBriefingCard`, `KataQuickStart`, `StretchRoutine`, `HabitCheckIn`, `TodayHabits`,
  `MorningCheckIn`. It shows state; it does not propose a plan.

**Skip / extend / net-new**
- Skip: do not reuse the name "recommend" — `pacing/recommend()` means practice load, W6 means task
  picks. Two different decisions with two different vocabularies.
- Extend: `settings.ts` gains waking hours, buffer %, and the anchor list.
- Net-new: capacity computation (pure, DST-safe), pick ranking (due date, cadence debt, energy fit,
  domain balance), confirm/swap UI, and the "Today" plan view.

**Conflicts:** the roadmap's ranking needs `Project.cadencePerWeek` (W10) and `Task.energy` (W1);
a first version can rank on due date + energy only, and say so.

---

## W7 — Time blocking and calendar view

**Status:** missing · **Size:** L · **Lanes:** B · **Depends on:** W1 (Block), W6 (picks)

**Evidence**
- Missing: no block entity, no timeline component, no drag/resize library —
  `grep -rInE "BlockSchema" src tests` → 0 hits; `package.json` has no `dnd-kit`/`react-dnd`/
  `framer-motion`-style drag library (only `motion` for animation).
- Exists (adjacent): `src/components/calendar/` holds `CalendarSettings.tsx` and `CalendarStatus.tsx` —
  these are the **Google Calendar connection** UI, not a time-block timeline.
- Exists: sessions can be pushed to a Google Calendar event (`src/lib/calendar/client.ts` →
  `createEvent`, `deleteEvent`; `session.calendarEventId`).

**Skip / extend / net-new**
- Skip: nothing.
- Extend: `motion` is already a dependency and can animate a proposed layout; reuse the existing
  "current or next block" surface pattern.
- Net-new: `Block` table + repository, day/week timeline, drag/resize with 5/15-minute snapping,
  auto-proposed layout, "replan from now", conflict detection UI.

**Conflicts:** the roadmap wants drag/resize to work with touch *and* mouse; `motion` is present but
no pointer/touch DnD library is. Budget for a dependency or a hand-rolled pointer implementation.

---

## W8 — Calendar interop (local-first)

**Status:** partial — the Google direction exists, and the local-first ICS core (export/import of
Blocks, `src/lib/ics/`) now ships as a pure module; file picker/share/screens, persisted
`calendarRef` and the flagged Android native calendar remain · **Size:** M ·
**Lanes:** C · **Depends on:** W1 (Block)

**Evidence**
- Exists: Google Calendar integration — OAuth via `src/lib/calendar/gis.ts`, token storage
  (`token-store.ts`), event create/delete/list (`client.ts`), sync (`sync.ts`), a dedicated
  "chrono-kata" calendar, and UI in `src/components/calendar/`. README documents
  `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`.
- Missing: ICS — `grep -rInE "\.ics\b|icalendar|vevent|BEGIN:VCALENDAR" src tests` → **0 hits**; no
  `ics` package in `package.json`. There is no import path and no export path for a local calendar.
- Missing: native Android calendar — `package.json` has only `@capacitor/android`, `@capacitor/app`,
  `@capacitor/core`, `@capacitor/local-notifications`; no calendar plugin, no `CalendarContract` code.
- Missing: `Block.calendarRef` — no `Block` table (see W7).

**Skip / extend / net-new**
- Skip: the Google OAuth code — it works and is user-visible.
- Extend: give `Block` a `calendarRef` and let the existing Google client write blocks, not just
  sessions.
- Net-new: ICS export, ICS import (file or pasted subscription URL, fetched only on explicit
  refresh), and — if still wanted — a flagged native-calendar plugin.

**Conflicts (needs a decision, see [Questions](#questions-for-the-human))**
- Roadmap principle 1 is "local-first, **no account**"; the only calendar path that exists requires
  a Google account and OAuth. The roadmap's own rule ("existing architecture wins") protects the
  Google integration, but principle 5 ("the calendar is for commitments, not wishes") is not yet
  enforced anywhere: today a session becomes a calendar event as a side effect of export.

---

## W9 — Work block → timed session flow

**Status:** partial — part 1 (session `outcome`/`breadcrumb` fields, the pure outcome plan and an
atomic session+task+project write) ships; the end-of-session sheet, the task picker in the timer and
the breadcrumb banner remain · **Size:** M · **Lanes:** B · **Depends on:** W1 (session links)

**Evidence**
- Exists: a real timer engine — `src/lib/timers/session-timer.ts` (draft persisted across reloads,
  `stoppedAtCap` soft cap), `src/lib/timers/habit-timer.ts`, bells via
  `src/lib/audio/bell-synthesizer.ts`, plus `src/components/session/Timer.tsx` (interval chimes
  supported — `intervalMinutes`).
- Exists: session modes — timed **or** reps (`src/lib/schemas/session.ts`: `durationMinutes` XOR
  `reps`), 1–5 rating plus focus/energy/mood (`MultiDimRatingSchema`), note, coach comment.
- Exists: durability + accuracy — elapsed time is computed from the start timestamp (pacing README
  "Already done"), and `tests/e2e/session-timer-durability.spec.ts` covers reload.
- Missing: no task/block link, no outcome field (done/progress/blocked) — `src/lib/schemas/session.ts`
  has no such field and no `taskId`.
- Missing: no breadcrumb — `grep -rInE "breadcrumb" src tests` → **0 hits**.
- Missing: "pick up here next time" surface, and no path from a session back to a task.

**Skip / extend / net-new**
- Skip: the timer engine — it is solid.
- Extend: `Session` gains optional `taskId`/`projectId`/`blockId` and a `outcome`
  (`'done'|'progress'|'blocked'`); a `breadcrumb` string can be a plain optional field on `Session`
  (non-indexed → no Dexie version bump) or on `Project` when W10 lands.
- Net-new: the end-of-session sheet (actual minutes, rating, outcome, breadcrumb) and the
  "pick up here" banner on the task/project.

**Conflicts:** if `breadcrumb` is stored on `Project` (W10), it needs an index and therefore a Dexie
version; storing the latest breadcrumb on `Session` avoids that. Worth deciding once, early.

---

## W10 — Long projects without heroic pushes

**Status:** missing · **Size:** M · **Lanes:** B · **Depends on:** W1 (Project), W6 (cadence debt)

**Evidence**
- Missing: no project entity — see W1's search (0 hits for `ProjectSchema`, `projectId`).
- Missing: no cadence — `grep -rInE "cadence" src tests` → **0 hits**.
- Missing: no stall detection, no minimum-viable-session button, no project page.
- Exists (philosophy precedent, reusable): the app already avoids guilt UI — streak freeze tokens,
  `recoveryMode`, and milestone celebrations (`src/components/streak/MilestoneCelebration.tsx`,
  `src/lib/streak/compute-streak.ts`) use soft/neutral language and no red overdue states. The
  roadmap's "never a red warning" matches the shipped behaviour.

**Skip / extend / net-new**
- Skip: nothing.
- Extend: reuse the "revive" tone already used for streaks; reuse `Session` rows as the project's
  time history.
- Net-new: `Project` fields (`cadencePerWeek`, `breadcrumb`, `lastTouchedAt`, `status`), cadence-debt
  computation, stall detection, the 10-minute minimum-session button, the project page.

**Conflicts:** `Project.status` includes `'dropped'`; the app's no-guilt principle says unpicked
things rest on the list — a hard `dropped` state needs a soft UI (and the weekly review in W11 is
where dropping happens, so they must agree).

---

## W11 — Weekly review wizard

**Status:** partial · **Size:** M · **Lanes:** B · **Depends on:** W1 (Task/Project), W6

**Evidence**
- Exists: an AI weekly reflection — `generateWeeklyReflection()` in `src/lib/llm/llm-service.ts`,
  `buildWeeklyReflectionUserText()` in `src/lib/llm/prompt-builders.ts`, a `Reflection` table
  (`src/lib/schemas/reflection.ts`: `periodStart`, `periodEnd`, `observations`, `question`,
  `sourceSessionIds`) and the `/reflect` route (`src/app/(main)/reflect/page.tsx` →
  `src/components/reflection/ReflectionCard.tsx`).
- Missing: no `Review` entity — `grep -rInE "ReviewSchema" src tests` → 0 hits; the reflection is a
  generated artifact, not a saved review with stats.
- Missing: the wizard itself — no guided 6-step flow, no inbox clearing, no sweep list, no domain
  balance, no estimate check, no "shape next week".
- Missing: pause/resume — no draft/state persistence for a multi-step flow.

**Skip / extend / net-new**
- Skip: nothing, but **reuse** the existing reflection generation as the optional AI summary step
  (step 6) rather than writing a second summarizer.
- Extend: `Reflection` gains an optional `weekOf`/`statsSnapshot`, or a sibling `Review` table is added.
- Net-new: the wizard flow with resumable state, the sweep decisions, the cadence targets step.

**Conflicts:** "review" is already used by `/reflect` (AI reflection) and by W20's "roadmap status
update". Name the wizard's artifact `Review` and leave "reflection" alone.

---

## W12 — Journal and domain accountability

**Status:** missing · **Size:** M · **Lanes:** B · **Depends on:** W1 (Domain), W6 (DayPlan)

**Evidence**
- Missing: no journal/day-plan entity — `grep -rInE "journal|JournalSchema|DayPlanSchema" src tests` → **0 hits**.
- Missing: no markdown export — the only export is the JSON envelope
  (`src/lib/data-transfer/export.ts`); `grep -rInE "\.md\b" src/lib/data-transfer` finds nothing.
- Missing: no domain checkboxes, no shutdown ritual, no journal template import.
- Exists (adjacent, not a journal): free-text `Session.note` (max 2000) and `Reflection.observations`.
  Neither is day-attached, templated, or searchable.

**Skip / extend / net-new**
- Skip: nothing.
- Extend: `DayPlan` (from W6) is the natural anchor for the journal entry and the shutdown note.
- Net-new: journal entry + template, domain checkboxes, evening shutdown ritual, markdown export
  per day/week/month, search over entries.

---

## W13 — Analytics and calibration

**Status:** partial · **Size:** M · **Lanes:** A (pure functions) + B · **Depends on:** W1 (estimates, domains)

**Evidence**
- Exists: analytics as pure functions — `src/lib/insights/`: `trends.ts`, `breakdown.ts`,
  `heatmap.ts`, `load-response.ts` (T10a), `yearly-matrix.ts`; components
  `RatingTrends`, `ActivityBreakdown`, `Heatmap`, `YearlyConsistencyHeatmap`, `MultiDimAverages`,
  `LoadResponse`; plus `src/components/dashboard/WeekChart.tsx` and the `/insights` route.
- Exists: session heatmap ✅ and rating trends ✅ — two of the roadmap's named charts.
- Missing: estimate accuracy, calibration factor, time per domain, project time, cadence adherence,
  inbox throughput — all need W1 entities that do not exist yet.
- Missing: CSV/JSON export of *analytics tables* — the only export is the whole-app JSON envelope.
- Note: charts are hand-written SVG (no chart library in `package.json`); the roadmap says "a
  lightweight library already in the stack, or one small addition" — there is no library in the stack.

**Skip / extend / net-new**
- Skip: the chart components and the pure-function style — this is the pattern W13 should extend.
- Extend: `src/lib/insights/*` gains pure functions over the new entities; the existing heatmap
  component can render a domain heatmap once `Task.domainId` exists.
- Net-new: estimate-accuracy distribution, calibration factor with raw/calibrated display, domain
  and project time, cadence adherence, inbox throughput, analytics export.

---

## W14 — AI coach upgrade (context and tools)

**Status:** partial · **Size:** L · **Lanes:** C · **Depends on:** W1, W3, W9

**Evidence**
- Exists: a multi-provider coach adapter with **five** feature entry points
  (`src/lib/llm/llm-service.ts`: `generateCoachComment`, `generateConversationReply`,
  `generateWeeklyReflection`, `suggestLabel`, `generateDailyBriefing`), each with a prompt builder
  in `src/lib/llm/prompt-builders.ts`.
- Exists: local conversation history — `conversations`/`messages` tables, `buildConversationContext()`
  in `src/lib/llm/conversation-history.ts`, `src/components/session/ConversationThread.tsx`,
  branched messages (`messages.parentId`).
- Exists: 3 of the 4 named coach modes in spirit (session kata coach, weekly reflection, daily
  briefing); "morning planner" and "stuck helper" do not exist.
- Missing: tool-calling — `grep -rInE "tool_choice|toolCalls?\b|function_call" src tests` → **0 hits**.
- Missing: prompt library — `grep -rInE "promptLibrary|prompt library" src tests` → **0 hits**; the
  5 personality prompts are constants in `src/lib/coaches/*.ts` and the prompts are hard-coded in
  `prompt-builders.ts`.
- Missing: a clear-history control for conversations — `grep -rInE "clearHistory|deleteConversation|clear" src/components/session/ConversationThread.tsx src/hooks/useConversation.ts` → **0 hits**.
- Missing: a token-budgeted context assembly — the closest thing is T5's `buildPacingContext()`
  (fixed, minimized payload), not a budgeted assembler.

**Overlap with T5 (g1, PR open) — this is the part of W14 already in motion**
T5a/b/c adds exactly the substrate this wave needs: the coach payload built from `recommend()` with
notes stripped (`src/lib/llm/pacing-context.ts`), validated JSON output with a deterministic fallback
and a contradiction guard (`src/lib/llm/clean-response.ts`), a shared pacing clause appended to every
personality (`src/lib/coaches/index.ts`), a context-hashed briefing cache
(`src/hooks/useDailyBriefing.ts`), and a "What gets sent" transparency panel
(`src/components/llm/WhatGetsSent.tsx`). **What T5 does not deliver:** tool-calling, the prompt
library, the morning-planner/stuck-helper modes, per-mode conversation history, and the confirm/diff
UI for AI writes.

**Skip / extend / net-new**
- Skip: the provider adapter, the prompt-builder module, the personality prompts' shape.
- Extend: build on T5's parse/validate/fallback pattern; build on the existing conversation tables
  (per-mode history is a `mode` column, not a new table).
- Net-new: tool-calling with a mock, the confirm/diff UI (the app currently has **no** AI write path
  at all, so this is greenfield), the editable prompt library with reset-to-default, and the two
  missing modes.

**Conflicts:** the roadmap's context assembly wants "today's plan, stalled projects, the estimate
calibration factor, and recent breadcrumbs" — that crosses the health-data boundary the pacing
work set (aggregates only). See [Questions](#questions-for-the-human).

---

## W15 — Practice and session modes

**Status:** partial · **Size:** M · **Lanes:** B · **Depends on:** W6 (anchors), W7 (blocks)

**Evidence**
- Exists: kata templates with `mode: 'timed' | 'reps'`, `softCapMinutes`, `intensity`, `defaultNote`,
  icons (`src/lib/schemas/kata-template.ts`), quick-start UI (`KataQuickStart.tsx`), settings UI
  (`KataTemplateSettings.tsx`), and habit-to-kata linking by id (T8, `linkedKataTemplateId`).
- Exists: bells — `src/lib/audio/bell-synthesizer.ts`; interval chimes in
  `src/components/session/Timer.tsx` (`intervalMinutes`); covered by
  `tests/e2e/kata-templates-audio.spec.ts`.
- Exists: count-based sessions — `reps` on `Session`.
- Missing: trading-session mode — no pre-session checklist template concept, no focus guard
  (`grep -rInE "focusGuard|focus guard" src tests` → **0 hits**), no post-session review template.
- Missing: silent/vibration-only mode — `navigator.vibrate` appears exactly once, in
  `src/components/streak/MilestoneCelebration.tsx:58` (a milestone effect), and no
  `@capacitor/haptics` dependency exists.
- Missing: kata → domain links and per-anchor/kata mode configuration (no anchors, no domains).
- Note: `kata-template.ts` has `defaultDurationMinutes`/`defaultReps` — a *default estimate*
  precedent, but for practice routines, not for roadmap tasks.

**Skip / extend / net-new**
- Skip: the kata template model — extend it with `domainId` and mode config instead of re-inventing
  "practice routines" in the task model.
- Extend: bells, reps mode, the quiet-session idea (a per-template "silent" flag), and the checklist
  concept (a template with ordered steps).
- Net-new: the trading-session mode (checklist + focus guard + post-session review), per-anchor
  configuration, haptics via `@capacitor/haptics`.

---

## W16 — Notifications and nudges

**Status:** partial · **Size:** M · **Lanes:** C · **Depends on:** W6/W11 (what to remind about), W5 (flags)

**Evidence**
- Exists: one gentle daily reminder — `shouldFireReminder()` in `src/lib/notifications/reminder.ts`
  (30-minute window, skips the day if a session was already logged), the web `Notification` API path
  in `src/hooks/useNotificationReminder.ts`, and `src/components/system/NotificationRunner.tsx`
  (mounted app-wide); settings `reminderTime` + `notificationsEnabled` in `settings.ts`; UI in
  `src/components/settings/ReminderSettings.tsx`.
- Exists: native notification support for one case — `src/lib/timers/cap-notification.ts` uses
  `@capacitor/local-notifications` to schedule/cancel the session-cap alert.
- Missing: the other four reminder kinds — no block start/end, no morning-plan, no shutdown, no
  weekly-review reminder (nothing in `src/lib/notifications/` beyond `reminder.ts`).
- Missing: quiet hours and snooze — `grep -rInE "\bsnooze\b|quietHours|quiet hours" src tests` → **0 hits**.
- Missing: the in-app banner fallback for browsers without the Notification API (the code just
  reports `permission: 'unsupported'`).

**Overlap with T9 (unclaimed):** T9 (Android hardening) touches the Android side of notifications
and backup; T9's board line is "Keystore keys, native HTTP, auto-backup, export E2E". Keep T9's
notification scope (native scheduling) and W16's scope (which reminders, when, quiet hours) split
cleanly, but agree on one owner for `@capacitor/local-notifications` changes.

**Skip / extend / net-new**
- Skip: the reminder scheduler shape (window + dedup + "already logged today" skip).
- Extend: generalize `shouldFireReminder` into a reminder-kind table; reuse the cap-notification
  helper for scheduling native notifications.
- Net-new: five reminder kinds, quiet hours, snooze, at-most-one-revive-nudge-per-day, and the
  in-app banner fallback.

**Conflicts:** flagged features need `settings.flags.*` — which does not exist yet (see
[Cross-cutting rules](#cross-cutting-rules-and-conflicts)).

---

## W17 — Android-native polish

**Status:** partial · **Size:** M · **Lanes:** C/D · **Depends on:** W9 (ongoing timer state)

**Evidence**
- Exists: a real Capacitor app — `capacitor.config.ts` (`appId com.chronokata.app`, `webDir out`,
  live-reload URL for dev), a checked-in `android/` project (`android/app/src/main/java/com/chronokata/app/MainActivity.java`
  is the only custom Java), `scripts/build-android.mjs` (static export + `cap sync`), and
  `docs/ANDROID_STUDIO_SETUP_HANDOFF.md`.
- Exists: native-aware runtime — `src/components/system/PlatformRuntime.tsx` unregisters the service
  worker on native, calls `storage.persist()` on web, and handles the hardware back button.
- Exists: background timer accuracy — elapsed time comes from the start timestamp, not from interval
  ticks (pacing README "Already done"); `tests/e2e/session-timer-durability.spec.ts` covers reload.
- Missing: home-screen widget — `grep -rInE "AppWidget|Glance|quick.?settings.?tile" src tests` → **0 hits**;
  no widget XML, no `appwidget-provider` in `android/app/src/main/res/xml/`.
- Missing: ongoing notification with pause/stop actions — `cap-notification.ts` schedules a single
  completion alert; no ongoing, no action buttons.
- Missing: haptics via Capacitor — only `navigator.vibrate` in
  `MilestoneCelebration.tsx`; no `@capacitor/haptics` dependency.
- Missing: share sheet for exports — `grep -rInE "navigator.share|share-target|ACTION_SEND" src tests` → **0 hits**.
- Missing: signed release build — `scripts/build-android.mjs` builds and syncs but does not sign;
  no keystore config in the repo.

**Skip / extend / net-new**
- Skip: the Capacitor scaffold, the build script, the timer-timestamp rule (already correct).
- Extend: `PlatformRuntime.tsx` is the natural home for the back-button audit across screens.
- Net-new: widget (custom native code — Capacitor has no widget support), ongoing notification with
  actions, `@capacitor/haptics`, share sheet, signing config, and a physical-device checklist.

**Conflicts:** the roadmap says widgets need custom native code in `android/` — that means the repo
takes on native maintenance, which is a maintenance decision, not just a feature.

---

## W18 — Backup, export, and optional sync

**Status:** partial · **Size:** M · **Lanes:** A/C · **Depends on:** W1 (stable schema)

**Evidence**
- Exists: versioned JSON export/import with a real migration path —
  `src/lib/data-transfer/{types,export,import,migrate}.ts`; `CURRENT_ENVELOPE_VERSION = 2`;
  `migrateEnvelope()` upgrades v1 → v2 and preserves local rows when a collection is absent
  ("absent means preserve"); per-row validation on import; `replaceAll()` for a clean restore;
  unit tests in `tests/unit/data-transfer/` (`export.test.ts`, `import.test.ts`, `check-ins.test.ts`);
  UI in `src/components/settings/DataTransfer.tsx`.
- Exists: secret hygiene — export blanks `apiKey` and skips env-sourced providers
  (`src/lib/data-transfer/export.ts:38-40`).
- Exists: "clear all data" — `src/components/settings/ClearDataSettings.tsx`.
- Missing: import preview and merge-vs-replace conflict handling — `DataTransfer.tsx:96` states
  "Importing replaces ALL local data"; there is no preview step and no merge path.
- Missing: encrypted backup — `grep -rInE "crypto\.subtle|AES-GCM|PBKDF2|Argon" src tests` → **0 hits**.
- Missing: automatic rotation of the last N backups, and device sync + `docs/SYNC_DECISION.md`
  (no such file; no sync code).

**Overlap with T9 (unclaimed):** T9's scope includes auto-backup and export E2E on Android — that is
the Android half of this wave. Coordinate so the backup format is defined once (here) and consumed by
T9, not forked there.

**Skip / extend / net-new**
- Skip: the envelope format and migration harness — extend them, don't replace them.
- Extend: `ExportEnvelope` gains new collections as optional fields (the same rule the pacing board
  used for v2), and `migrateEnvelope()` gains the next step.
- Net-new: import preview + merge mode, passphrase-encrypted backup (WebCrypto), local rotation,
  and the sync evaluation doc before any sync code.

**Conflicts:** the roadmap's "export → wipe → import restores everything identically (deep-equal
test)" is a strict superset of today's tests — the deep-equal test would fail for tables that
migrate on import. Decide whether the round trip is identity or "migrated identity".

---

## W19 — UX, accessibility, performance

**Status:** partial · **Size:** M · **Lanes:** B · **Depends on:** W1 (data volume for perf)

**Evidence**
- Exists: theming — `settings.theme` (`system|light|dark`), `accentColor`, `ratingStyle`
  (`src/lib/schemas/settings.ts`), `ThemeSettings.tsx`, `src/app/globals.css` tokens (theme tokens
  registered in `@theme` since `69b77a8`), `ThemeApplier.tsx`/`ThemeScript.tsx`.
- Exists: a11y for modals — `src/components/ui/Modal.tsx` has Escape handling, a focus trap,
  scroll lock, `aria-hidden` and focus restore; `ConfirmDialog.tsx`, `Toast.tsx` exist.
- Exists: onboarding — `src/app/onboarding/page.tsx` + `src/components/onboarding/PersonalityPicker.tsx`
  (personality only), PWA install prompt, FAB, tab bar, confirmation settings.
- Missing: command palette — `grep -rInE "palette|Ctrl\+K|metaKey && .*'k'" src tests` → **0 hits**.
- Missing: keyboard-shortcut cheat sheet, high-contrast mode.
- Missing: reduced-motion support — `grep -rIn "prefers-reduced-motion|useReducedMotion" src` → **0 hits**,
  while `motion/react` animates across the app.
- Missing: virtualization and a 10k-task/5k-session perf test — no list virtualization library in
  `package.json`; sessions are rendered as plain lists.
- Missing: domain colors / WCAG AA audit, and first-run setup of domains/anchors/project.

**Skip / extend / net-new**
- Skip: the theme system, the modal a11y work, the onboarding shell.
- Extend: the existing `Modal`/`ConfirmDialog` focus handling is the template for a palette's focus
  management; `motion`'s `useReducedMotion` covers reduced-motion globally.
- Net-new: palette + cheat sheet, high-contrast mode, virtualization, the perf budget test, and an
  extended first-run that also creates the first domain/anchor/project.

---

## W20 — Hardening and release

**Status:** partial · **Size:** L · **Lanes:** D · **Depends on:** everything above

**Evidence**
- Exists: 11 Playwright specs — session flow, timer durability, morning check-in, conversation
  thread, kata templates + audio, LLM setup, onboarding, settings + theme, goals + streak protection,
  daily briefing + heatmap, athena secret.
- Exists: unit coverage is broad (78 files / 526 tests) and the precommit gate is enforced locally.
- Missing: e2e coverage of the roadmap's core loop (capture → triage → pick → block → session →
  breadcrumb → review) — none of those entities exist yet.
- Missing: error boundary on every route — `find src -name "error.tsx"` and
  `grep -rIl "componentDidCatch"` → **0 hits**; a render error in any route currently blanks the app.
- Missing: local error log — no error log table/UI; "no telemetry" is honoured by having nothing.
- Missing: data integrity checker — no orphan detection for sessions/reflections/habits/check-ins.
- Missing: `docs/USER_GUIDE.md`, release tagging, signed APK/AAB, static web build release.

**Skip / extend / net-new**
- Skip: nothing — extend the existing spec suite.
- Extend: `next` supports `error.tsx` per route segment; the existing `Toast`/`ConfirmDialog`
  components are the reporting surface.
- Net-new: error boundaries + local error log, integrity checker with one-tap repair, the loop e2e,
  user guide, and a release runbook.

**Conflicts:** none.

---

## Stretch backlog

| Item | Status | Evidence |
|---|---|---|
| Energy check-in | **partial** | Exists: `MorningCheckIn` (`src/components/checkin/MorningCheckIn.tsx`), `checkIns` table (Dexie v5), `CheckIn.energy` 1–5 (`src/lib/schemas/check-in.ts`). Missing: the *consumer* — nothing biases pick suggestions by energy (no picks exist). |
| "Waiting for" tracker | missing | `grep -rInE "\bwaiting\b|blockedOn" src tests` → **0 hits**; no follow-up dates. |
| Templates for recurring chores | missing | `grep -rInE "chore" src tests` → 0 hits. Nearest: `Habit` has a daily/weekdays schedule (`src/lib/schemas/habit.ts`) and `KataTemplate` is a manual quick-start, not a schedule-spawning template. |
| Context lists (`@hardware-store`) | missing | No context field anywhere: `grep -rInE "\bcontext\b" src/lib/schemas` → 0 hits. |
| Location reminders | missing | No location plugin or dependency: `grep -rInE "geolocation|Geolocation\|\blocation\b" src tests package.json` → **0 hits** (only `window.location` URL reads). |
| Focus soundscapes | partial | `src/lib/audio/bell-synthesizer.ts` (bells) + interval chimes in `Timer.tsx`; no generated noise loop, no per-session soundscape. |
| Plain-text mirror (todo.txt/markdown) | missing | Only the JSON envelope exists (`src/lib/data-transfer/export.ts`); no markdown/todo.txt writer. |
| LLM eval harness | missing | `grep -rInE "eval|benchmark" src tests` → no harness; `src/lib/pacing/seed-data.ts` is a data fixture, not an eval set. |

---

## Cross-cutting rules and conflicts

These apply to every wave and are not optional per-wave choices.

1. **Dexie version sequence.** v1–v6 exist; **v7 is next free** (v5 = `checkIns`, v6 =
   `sessions.kataTemplateId`). Any new table or indexed field takes the next version, must add a
   frozen row to `HISTORICAL_STORES` in `tests/unit/db/migrations.test.ts`, and must keep existing
   rows (the v3→v4 pattern in `tests/unit/db/db-upgrade.test.ts` is the precedent). Optional,
   non-indexed fields need no version bump.
2. **Local day keys.** `toLocalDateString` (`src/lib/utils/date.ts`) for every day-keyed row —
   `DayPlan.date`, journal dates, review weeks. `toISOString().slice(0,10)` is wrong (it is UTC) and
   is a known source of date-rotten tests.
3. **Health data leaves the device as aggregates only.** This is the rule the pacing work set for the
   coach path. W3/W4/W14 add more AI surfaces — each new prompt payload must state what leaves the
   device. See [Questions](#questions-for-the-human) Q2.
4. **Schema changes are logged.** `src/lib/schemas/CHANGELOG.md` (exists — kept by the pacing
   work; see its entries for v5/v6).
5. **Feature flags — mechanism shipped (decision Q4).** Roadmap principle 8 assumes
   `settings.flags.*`; it now exists as an optional, non-indexed `flags` field on the singleton
   settings row, with the closed name union `privateMode | nativeCalendar | nudgeKinds | sync`
   (`src/lib/schemas/settings.ts`, `src/lib/settings/flags.ts`, `src/hooks/useFlags.ts`, PR #15).
   A row written before flags existed stays valid, no Dexie version was needed, and every flag
   reads with an explicit default until the feature behind it is built (W5 local-only, W8 native
   calendar, W16 nudge kinds, W18 sync). No flagged feature is built yet.
6. **AI proposes, user disposes.** The app currently has **no** AI write path — every AI feature
   generates text for the user to read. The first tool call (W14) introduces writes, so the
   confirm/diff UI must land in the same wave.
7. **No guilt UI.** The shipped app already honours this (streak freeze tokens, `recoveryMode`,
   milestone celebrations, no red overdue counts). Roadmap wording matches ("never a red warning"),
   so W10/W11/W12 must not introduce one.
8. **Existing architecture wins** where the roadmap contradicts it — except where the roadmap states
   otherwise (e.g. W8's ICS direction conflicts with the Google-first calendar that exists; see Q3).
9. **Two vocabularies that must not merge:** *practice* (kata templates, habits, streaks, check-ins,
   pacing) and *work* (tasks, projects, picks, blocks, breadcrumbs). Both live in one app, one Dexie
   database, and one LLM context. Name tables, columns and prompts so a task is never a session.
10. **Wave notes and status updates.** Every wave ends with `docs/waves/wave-NN.md` + a CHANGELOG
    entry + a `docs/ROADMAP_STATUS.md` update. Neither convention exists yet (`docs/waves/` is
    absent, `docs/ARCHITECTURE.md`/`docs/DATA_MODEL.md` are being written now). Decide in W0 who
    writes them — recommended: the builder of the wave, in the same PR.

---

## Proposed order and parallelism

Lanes: **A** data/domain · **B** UI · **C** AI/integration · **D** QA.

| Group | Parallel work | Why it can run together | Gate to the next group |
|---|---|---|---|
| **1** | W1 (A) · W5 (C) · CI + test hardening (D) | W1 touches `src/lib/db` + `src/lib/schemas`; W5 touches `src/lib/llm` + the LLM tab; D touches `.github` + `scripts` | W1 merged (v7) and W5's routing/flags landed |
| **2** | W2 (B) · W3 (C) · W8 (C) | Capture needs tasks; decomposition needs tasks + W5; ICS is independent of both | W3 has a validated JSON contract; W8's ICS format fixed |
| **3** | W6 (A+B) · W9 (B) · W13-extend (A) | Capacity math is pure; session links touch `Session`; analytics functions stay pure | W6 ships capacity + pick ranking; W9 ships outcome/breadcrumb |
| **4** | W7 (B) · W10 (B) · W11 (B) · W12 (B) | All four need W1's entities; they touch different screens | Reviews/journals exist to hang off |
| **5** | W14 (C) · W15 (B) · W16 (C) · W17 (C/D) | Coach tools need W3/W9 + the confirm UI; practice modes need W7 anchors; nudges need W6/W11 subjects; Android polish needs W9's timer state | Confirm/diff UI exists before any tool call |
| **6** | W18 (A/C) · W19 (B) | Backup/encryption and UX/perf are independent of each other | Schema is stable |
| **7** | W20 (D) | Needs the loop to exist end to end | — |

**Sequencing notes**
- W1 is the only hard prerequisite; everything in groups 2–4 assumes it.
- W5 and the flags mechanism are the only group-1 work that no other wave depends on but several
  depend on; if seats are scarce, do W5 early.
- W3 (decomposition) and W14 (tools) are the same feature seen from two ends — decomposition is the
  first tool. Building W3 before W14 avoids two prompt/JSON styles.
- W9 (session outcome/breadcrumb) is cheap and unlocks W10, W14 and W17 — do it early.
- W18's encryption and W19's perf work are the natural "slack" fillers; the stretch backlog is only
  worth pulling once groups 1–4 are done.

**Sizes:** S ≈ ≤1 day one seat · M ≈ 2–4 days · L ≈ 1–2 weeks.

---

## Questions for the human

1. **Practice vs work in one model.** Today practice (sessions, kata templates, habits, streaks,
   check-ins) is the app's whole model. Should practice become just another `Domain` with tasks, or
   stay first-class outside the task graph? The roadmap never says — this decides W1's schema.
   → **Decision Q1**
2. **Health-data boundary vs coach context.** W14 wants the coach to see today's plan, stalled
   projects and breadcrumbs. Is that "health data" (aggregates-only rule) or "task data" (fine to
   send)? Which rule wins when they collide? → **Decision Q2**
3. **Calendar: keep Google, add ICS, or replace?** The only calendar that exists is Google Calendar
   (account + OAuth), which sits awkwardly with "local-first, no account". Does the Google
   integration stay as an optional target while ICS becomes the primary path? → **Decision Q3**
4. **Feature flags shape.** `settings.flags.*` on the singleton settings row, or a dedicated
   `flags` table? (Both need a Dexie version if the table route is taken.) → **Decision Q4**
5. **Estimates before multi-provider.** `Estimate.source` is `'user' | providerId`. Is a single active
   provider enough until W4, or must the multi-provider slice land first? → **Decision Q5**
6. **One session table or two?** The roadmap wants a session to be a timed work block on a task;
   the app's session is a practice session with rating/reps/cap. One table with optional `taskId`, or
   a separate work-session table? → **Decision Q6**
7. **Waking hours and buffer.** Capacity = waking hours − fixed − anchors − buffer (default 25%).
   Is the buffer 25% of waking hours or of the free time? Where do waking hours come from (a new
   settings field)? → **Decision Q7**
8. **Breadcrumb storage.** Latest breadcrumb on `Session` (no index, no Dexie version) vs on
   `Project` (indexed, needs v7+)? This changes W1's schema. → **Decision Q8**
9. **Native maintenance appetite.** W17's widget and quick-settings tile need custom code in
   `android/` (Capacitor has no widget support). Is the repo willing to own a custom native plugin?
   → **Decision Q9**
10. **Who writes `docs/waves/wave-NN.md`?** Recommended: the builder of each wave, in the same PR, with
    the CHANGELOG entry and the `docs/ROADMAP_STATUS.md` update. → **Decision Q10**
11. **Android signing.** W17/W20 want a signed APK/AAB. Is the keystore to live outside the repo
    (CI secrets) and who owns the release runbook? → **Decision Q11**

---

## Decisions (lead, 2026-10-23)

LEAD DECISIONS ON ROADMAP_STATUS "QUESTIONS FOR THE HUMAN" (2026-10-23)
Made by dev.lead under the human's "implement and process the roadmap, go for it". Each follows the roadmap's own text or the existing architecture; the human can veto any of them before the wave that depends on it ships.

Q1 Practice vs work: practice (sessions, kata templates, habits, streaks, check-ins, pacing) stays first-class and unchanged. It is NOT re-modelled as tasks. Domain is an optional link (Habit/KataTemplate get optional domainId; seed a "Practice" domain). The roadmap's W1 text already says this.
Q2 Health-data boundary vs coach context: DEFERRED to W14. Until then health data (check-ins, pacing) stays aggregates-only, and any new AI surface that would send task/project/journal data must show exactly what leaves the device in a "What gets sent" panel (the T5c pattern). W14's builder asks the human before extending the coach payload.
Q3 Calendar: ICS is ADDITIVE. Google Calendar stays as an optional target; nothing is removed without the human's OK. Re-confirm with the human when W8 starts.
Q4 Feature flags: settings.flags.* on the singleton settings row (optional non-indexed field, so no Dexie version). Built as a small prerequisite task before W5/W8/W16/W18.
Q5 Estimates before multi-provider: one active provider is enough until W4. Estimate.source = 'user' | providerId is stored from W3 on.
Q6 Sessions: ONE session table. Session gains optional taskId/projectId/blockId (the roadmap's W1 text). A task is never a session; keep the vocabularies separate in tables, columns and prompts.
Q7 Capacity: buffer = 25% of free time (waking hours minus fixed minus anchors). Waking hours become a new settings field. W6's builder confirms with a unit test.
Q8 Breadcrumb: stored per Session as an optional non-indexed field (history), with the latest denormalized onto Project.breadcrumb / Task.nextAction exactly as the roadmap's W1 entities specify.
Q9 Native widget / quick-settings tile appetite: DEFERRED to W17. Ask the human then.
Q10 Wave notes: the builder of each wave writes docs/waves/wave-NN.md + CHANGELOG entry + the docs/ROADMAP_STATUS.md update, in the same PR as the wave.
Q11 Android signing: DEFERRED to W17/W20. The keystore never goes in the repo. Ask the human then.
Also: no GitHub Actions workflow yet. CI is the local one-command `npm run ci` (d1, Wave 0). If the human wants hosted CI, they will say so.

---

## Bugs found while auditing (listed, not fixed — this wave is docs-only)

1. **A fresh clone cannot build or run.** `src/lib/coaches/athena-persona.ts` is gitignored
   (`.gitignore:11`) but imported by `src/lib/coaches/index.ts:1`. On a clean checkout:
   `npm run build` → `Failed to compile. Module not found: Can't resolve './athena-persona'`;
   `npm run dev` → **HTTP 500 on every route**; `npm run typecheck` → TS2307 ×2; `npm test` → the
   athena test file fails to load. The README's setup section (`npm install` → `npm run dev`) does
   not mention the required copy, and `src/lib/coaches/README.md` only says "repeat the above steps".
   *Fix candidate (prepared, not pushed, on branch `fix/athena-persona-fresh-clone`):* a
   `scripts/ensure-athena-persona.mjs` that copies the tracked `athena-persona.ts.example` into place
   **only when the file is absent** (never overwriting a personal persona), wired to `postinstall`,
   `predev`, `prebuild`, `pretypecheck` and `pretest`. Verified on a clean checkout: `npm run build`
   succeeds and `npm run dev` answers HTTP 200.
2. **"Baseline tests pass" was false until PR #7.** Two tests were red on `main` at `69b77a8`:
   `tests/unit/theme/theme-tokens.test.ts` (mkdtemp ENOENT on `node_modules/.cache`) and
   `tests/unit/insights/LoadResponse.test.tsx` (date-rotten: a `2026-09` fixture expected to be
   "this month"). Fixed by `2dbe51a`.
3. **Date-rotten fixtures are a recurring hazard** — the same class of failure will hit any new
   day-keyed entity (W1 `DayPlan`, W12 journal). New date-sensitive tests should use
   `vi.useFakeTimers()`.
4. **No CI.** `.github/` does not exist, so the `precommit` gate only runs on whoever's machine.
5. **No error boundary on any route** — one render error blanks the app (relevant to W20).
