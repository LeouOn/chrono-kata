# chrono-kata — Expansion Roadmap (Waves 0–20)

> **For the agents:** This roadmap was written without access to the repo. **Wave 0 is mandatory**: map the existing code, then reconcile every later wave against what already exists. If something below is already built, skip or extend it. Don't duplicate it. If the existing architecture contradicts a suggestion, the existing architecture wins unless the wave says otherwise.

## North star

chrono-kata becomes a **local-first daily operating system**. It captures everything, turns vague tasks into concrete next actions, picks a small realistic set of things for today, and runs those as timed work blocks. It also keeps long projects alive through small regular sessions instead of heroic pushes, and learns from the gap between estimated and actual time.

Core loop:

```
Capture → Triage (next action + estimate) → Daily picks (1–3) → Time block → Timed session
   ↑                                                                    ↓
Weekly review ← Analytics (estimate accuracy, domain balance) ← Breadcrumb + session log
```

## Design principles (apply to every wave)

1. **Local-first, no account, no backend.** All data lives in IndexedDB (Dexie). Network use is optional and only for LLM providers or explicit user-triggered export/sync.
2. **Never lose data.** Every schema change is a Dexie `version(n).stores(...).upgrade(...)` migration with a test that loads the previous version's fixture data.
3. **No guilt UI.** No red overdue counts, no shame streak-breaks. Unpicked tasks simply rest on the list. Missed days get a neutral "welcome back" instead of a reset animation.
4. **Small > big.** The app should always nudge toward the smallest next startable action (≤ 25 min, startable in 5).
5. **The calendar is for commitments, not wishes.** Only fixed events, anchors, and chosen focus blocks get time slots.
6. **AI proposes, user disposes.** Any LLM-generated change to tasks, plans, or the calendar is shown as a diff/preview and needs one-tap confirmation.
7. **Mobile-first, keyboard-friendly on desktop.** Every core action is reachable in ≤ 2 taps on Android and has a keyboard shortcut on web.
8. **Feature flags** for anything experimental (`settings.flags.*`), so half-done waves don't break daily use.

## Suggested lanes per wave

Run these concurrently where possible:

- **Lane A: Domain/Data.** Dexie schema, migrations, repositories, pure logic (scheduling, estimates).
- **Lane B: UI.** Screens, components, interactions, accessibility.
- **Lane C: AI/Integration.** LLM prompts, provider adapters, calendar/ICS, Capacitor plugins.
- **Lane D: QA.** Unit tests (Vitest + `fake-indexeddb`), component tests, Playwright e2e, Android smoke test.

Each wave ends with: tests green, a migration test for any schema change, a CHANGELOG entry, and a short `docs/waves/wave-NN.md` note (what shipped, what was deferred, known issues).

---

## Wave 0: Audit and baseline (mandatory)

- Map the codebase: routes, Dexie schema and versions, stores/state management, AI coach provider abstraction, timer engine, habit/streak logic, kata templates, and the Capacitor config.
- Write `docs/ARCHITECTURE.md` (current state) and `docs/DATA_MODEL.md` (current tables and indexes).
- Reconcile this roadmap: mark each wave item as *exists / partial / missing* in `docs/ROADMAP_STATUS.md`.
- Set up or verify tooling: Vitest, `fake-indexeddb`, Playwright, ESLint, TypeScript strict mode (or document why it's off), and a CI script that runs typecheck + tests + build.
- Create fixture exports of current data (synthetic) for future migration tests.
- **Done when:** the status doc exists, CI runs locally with one command, and baseline tests pass.

## Wave 1: Unified data model for tasks, projects, domains

New or extended entities (adapt names to the existing conventions):

```ts
Domain   { id, name, color, icon, order }           // seed: Trading, Practice, Career/Build, Life admin
Project  { id, title, domainId, status: 'active'|'paused'|'done'|'dropped',
           cadencePerWeek?: number, breadcrumb?: string, lastTouchedAt, createdAt }
Task     { id, title, nextAction?: string, domainId?, projectId?, parentId?,
           status: 'inbox'|'next'|'scheduled'|'waiting'|'done'|'dropped',
           estimateMin?, actualMin?, energy?: 'low'|'med'|'high',
           context?: string[], dueAt?, deferUntil?, source: 'manual'|'voice'|'share'|'ai'|'import',
           createdAt, touchedAt, doneAt? }
Block    { id, start, end, kind: 'fixed'|'anchor'|'focus', taskId?, projectId?, title, calendarRef? }
DayPlan  { date, picks: TaskId[], capacityMin, shutdownNote?, journal? }
Estimate { id, taskId, source: 'user'|providerId, minutes, rationale?, createdAt }
```

- Link existing **Sessions** to optional `taskId`/`projectId`/`blockId`.
- Link existing **Habits/Katas** to optional `domainId`.
- Repository layer with typed queries (by status, domain, project, stale-since).
- **Done when:** the migration from the previous schema passes a fixture test, and CRUD for every entity is unit-tested.

## Wave 2: Capture (the inbox)

- A global **quick-capture** input reachable from every screen (floating button on mobile, `Ctrl/Cmd+K` → "Add").
- **Natural-language parsing** (rule-based first, no LLM): `fix hose #life ~20m !high tomorrow @hardware-store` → domain, estimate, energy, defer date, context.
- **Bulk paste:** paste a messy multi-line list, and it splits into inbox items with a preview before saving.
- **Voice capture** on Android via a speech-recognition Capacitor plugin (e.g., `@capacitor-community/speech-recognition`), with Web Speech API fallback on web.
- **Android share target:** share text or a URL from any app into the inbox (community send-intent plugin or a small custom native plugin).
- An inbox screen with a zero-friction "process" mode, one item at a time: *Do now (<2 min) / Next action / Schedule / Waiting / Drop / Make project*.
- **Done when:** a captured item survives app restart, and the parser has ≥ 30 table-driven tests.

## Wave 3: Next-action decomposition (AI)

- "**Break it down**" on any task or project, via the existing multi-provider AI coach adapter.
- Structured JSON output validated with zod:
  ```ts
  { firstAction: string, firstActionMinutes: number, needs: string[],
    steps?: {title, minutes}[], pitfalls: string[], canSkipOrDoBadly: string[] }
  ```
- Prompt rules: return **one first physical action** that can be started in 5 minutes. Keep `steps` to ≤ 7 and collapse them by default. Always include pitfalls and a "what you can skip" list.
- The UI shows the first action prominently. Steps are optional to save as subtasks (`parentId`), and the user picks which ones.
- A "**This feels heavy**" button on any task triggers the same flow with a prompt focused on shrinking scope.
- Retry/repair logic: if JSON validation fails, re-prompt once with the validation error, then fall back to plain text.
- **Done when:** schema validation and fallback are tested with mocked provider responses, and no AI output is saved without confirmation.

## Wave 4: Multi-model triangulation

- Query **2–3 providers in parallel** (any configured: Anthropic, OpenAI, Gemini, local LM Studio) for the same decomposition or estimate.
- A merge view shows where the models agree, where they disagree (especially time estimates and dependencies), and the spread (min/median/max minutes).
- Store every estimate in `Estimate`, so analytics can later score which source is best calibrated *for this user*.
- Cost/latency guard: show the expected number of calls and allow "local only" mode.
- **Done when:** a merge with partial provider failure (one times out) still renders, and estimates persist.

## Wave 5: Local LLM backbone

- A first-class **LM Studio** provider (OpenAI-compatible API, default `http://<host>:1234/v1`), with a host field, model picker (`/v1/models`), and a health check.
- **Android → LAN host:** document and implement the network security config for cleartext LAN HTTP (or recommend a reverse proxy with TLS), plus a clear error when the host is unreachable.
- Per-feature provider routing in settings, e.g. decomposition → local, weekly review summary → cloud, and "private mode" → local only.
- Context budget manager: truncate or summarize task lists for smaller-context local models.
- **Done when:** the app works fully offline with local inference, or with AI disabled entirely.

## Wave 6: Daily planning (picks and capacity)

- A **morning plan** screen, or the night before, configurable:
  1. Show today's fixed blocks and anchors.
  2. Compute **capacity** = waking hours − fixed blocks − anchors − buffer (default 25%).
  3. Suggest **1–3 picks** from `next` tasks, ranked by due date, project cadence debt, energy fit, and domain balance.
  4. The user confirms, swaps, or adds picks. Total estimates are checked against capacity, with a gentle warning when overcommitted.
- **Anchors:** user-defined recurring protected windows (e.g., a "Trading session" anchor on weekdays). Picks never get scheduled inside an anchor unless they belong to its domain.
- A "**Today**" home view: picks, the current or next block, and one-tap start timer.
- **Done when:** capacity math is unit-tested (including DST transitions and anchors crossing midnight), and the planning flow is e2e-tested.

## Wave 7: Time blocking and calendar view

- Day and week **timeline views**: drag picks into focus blocks, resize, and snap to 5/15 minutes.
- Auto-propose a block layout for today's picks (respecting anchors, energy preferences like "high energy before noon", and buffers).
- A "**replan from now**" button: when the day slips, re-lay the remaining picks into the remaining time without guilt. Overflow goes back to `next`.
- Conflict detection and resolution UI.
- **Done when:** drag/resize works with touch on Android and the mouse on web, and replanning is deterministic and tested.

## Wave 8: Calendar interop (local-first)

- **ICS export:** today's or this week's blocks as an `.ics` file (e.g., the `ics` npm package), shareable to any calendar app.
- **ICS import:** read fixed events from an `.ics` file or a pasted subscription URL (fetched only on explicit refresh).
- **Android native calendar** (optional, flagged): read and write events via a Capacitor calendar plugin or a small custom plugin over `CalendarContract`, with explicit permission prompts.
- Two-way mapping via `Block.calendarRef`, so re-exports update rather than duplicate.
- **Done when:** round-trip ICS export → import produces identical blocks (timezone-correct).

## Wave 9: Work block → timed session flow

- Starting a block launches a **timer session** prefilled with the task's next action and estimate.
- Supported modes: countdown, Pomodoro-style intervals, open-ended stopwatch, with gentle bells (reuse the existing timer engine).
- End-of-session sheet:
  - Actual minutes (auto-filled), rating (existing), and "done / progress / blocked".
  - **Breadcrumb:** "Pick up here next time: ___" (required for projects, optional for tasks). This is the "stop mid-sentence" trick.
  - If progress was made, propose the next action from the breadcrumb, with an optional AI cleanup.
- The breadcrumb shows up at the top of the task/project the next time it's opened or picked.
- **Done when:** session ↔ task ↔ block links persist, and actual minutes feed `Task.actualMin`.

## Wave 10: Long projects without heroic pushes

- **Cadence:** each project can have a target like "2 blocks/week, 45 min". The planner treats unmet cadence as "cadence debt" and favors those projects in picks (capped so one project can't dominate).
- **Stall detection:** a project untouched for N days (configurable) gets a soft "revive" card offering a **10-minute minimum session** with its breadcrumb, never a red warning.
- A **"minimum viable session"** button on any project: a 10-minute timer whose only goal is to touch it and leave a breadcrumb.
- Project page: breadcrumb history (timeline), sessions, time invested, and next action.
- **Done when:** cadence debt and stall logic are unit-tested with simulated weeks.

## Wave 11: Weekly review wizard

- A guided 15–25 minute flow:
  1. **Clear the inbox:** process the remaining items.
  2. **Sweep the lists:** for each stale `next` task, choose *keep / redefine next action / defer / drop*. Make dropping easy and guilt-free.
  3. **Projects:** confirm the status, breadcrumb, and next action for each active project. Pause anything you aren't actually going to touch.
  4. **Domain balance:** time per domain this week vs. stated intentions.
  5. **Estimate check:** this week's estimated vs. actual minutes.
  6. **Shape next week:** rough intentions per domain, and project cadence targets.
- An optional AI summary ("what moved, what stalled, one suggestion"), routed per Wave 5 settings.
- Saved as a `Review { weekOf, notes, stats snapshot }` entity.
- **Done when:** the wizard can be paused and resumed mid-flow without losing state.

## Wave 12: Journal and domain accountability

- A daily journal entry attached to `DayPlan`, with **domain checkboxes** (Trading, Practice, Career/Build, Life admin) and a customizable template.
- Import an existing journal template (markdown) as the default.
- Shutdown ritual (evening, optional): mark picks done or rolled back, write the shutdown note and tomorrow's first action, and check off domains.
- Markdown export per day/week/month.
- **Done when:** the template is editable and entries are searchable.

## Wave 13: Analytics and calibration

- **Estimate accuracy:** distribution of actual/estimated ratio, overall and per domain, energy level, and estimate source (user vs. each model).
- **Personal calibration factor:** optionally auto-scale new estimates by your historical median ratio. Show both raw and calibrated values.
- Time per domain, a sessions heatmap, project time invested, cadence adherence, and inbox throughput (captured vs. processed).
- Charts with a lightweight library already in the stack, or one small addition. All computation is local.
- CSV/JSON export of the analytics tables (good material for a data-analysis portfolio piece).
- **Done when:** analytics are computed via pure functions with tests over a synthetic 90-day dataset.

## Wave 14: AI coach upgrade (context and tools)

- Coach **context assembly:** today's plan, recent sessions, stalled projects, the estimate calibration factor, and recent breadcrumbs, within a token budget.
- **Tool-calling** (where the provider supports it): `create_task`, `update_task`, `propose_plan`, `start_session`, `log_breadcrumb`. Every write goes through the confirm/diff UI from principle 6.
- Coach modes: *morning planner*, *stuck helper* (shrink the next action), *weekly reviewer*, *kata coach* (the existing coaching).
- A prompt library editable in settings, versioned with reset-to-default.
- A conversation history per mode, stored locally, with a clear-history control.
- **Done when:** tool calls are mocked and tested, and no write happens without confirmation.

## Wave 15: Practice and session modes

- **Trading-session mode:** a configurable pre-session checklist kata, a "focus guard" during the anchor (hides non-trading picks and mutes non-essential notifications), and a post-session review template. The app only structures the routine and gives no market advice.
- **Practice mode:** interval bells (start, intervals, end), optional silent vibration-only mode, and a count-based session option (e.g., repetitions or rounds) alongside time-based sessions.
- Kata templates gain optional domain links and default estimates.
- **Done when:** modes are configurable per anchor or kata, and focus guard settings persist.

## Wave 16: Notifications and nudges

- Local notifications via `@capacitor/local-notifications`: block start/end, morning plan reminder, shutdown reminder, weekly review reminder.
- Nudges stay **opt-in and gentle**: at most one revive-project nudge per day, quiet hours, and snooze options.
- Web fallback: the Notifications API where supported, otherwise in-app banners.
- **Done when:** scheduling survives app restart and device reboot (verify on Android), and quiet hours are respected.

## Wave 17: Android-native polish

- **Home screen widget** (custom native code; Capacitor doesn't provide widgets): the current or next block, today's picks, and a quick-capture button.
- **Quick Settings tile** for quick capture or starting the next block (optional).
- An ongoing notification while a timer runs, with pause/stop actions.
- Handle background timer accuracy correctly: compute elapsed time from timestamps, never from interval ticks.
- Haptics, a share sheet for exports, and back-button behavior audited on every screen.
- **Done when:** a manual Android test checklist passes on a physical device and the release build is signed.

## Wave 18: Backup, export, and optional sync

- **Full export/import:** versioned JSON of all tables, with an import preview and conflict handling (merge vs. replace).
- **Encrypted backup:** passphrase-based (WebCrypto AES-GCM with PBKDF2 or Argon2 via WASM), saved as a file.
- Automatic local backup rotation (keep the last N), with restore from any of them.
- **Optional device sync (flagged, experimental):** a file-based approach, e.g. writing an encrypted change log to a user-chosen folder synced by Syncthing or similar. Alternatively, evaluate a CRDT (Automerge or Yjs) for the task and journal tables. Write the evaluation to `docs/SYNC_DECISION.md` before implementing.
- **Done when:** export → wipe → import restores everything identically (verified by a deep-equal test).

## Wave 19: UX, accessibility, performance

- A command palette (`Ctrl/Cmd+K`) covering all core actions, plus a keyboard-shortcut cheat sheet.
- Theming: light/dark/system, an optional high-contrast mode, and domain colors meeting WCAG AA.
- Accessibility pass: focus order, ARIA on custom components, screen-reader labels for timers, and reduced-motion support.
- Performance: virtualize long lists, add Dexie index review and query profiling, and test with 10k tasks and 5k sessions on a mid-range Android.
- Empty states and first-run onboarding: set up domains, anchors, and one project, in under 2 minutes.
- **Done when:** a Lighthouse/axe audit has no critical issues and the 10k-task dataset stays responsive.

## Wave 20: Hardening and release

- Fill e2e coverage of the core loop: capture → triage → pick → block → session → breadcrumb → review.
- Error boundary on every route, plus a local error log viewable in settings and exportable for debugging (no telemetry).
- Data integrity checker: find orphaned sessions, blocks pointing at deleted tasks, and impossible timestamps, with one-tap repair.
- Docs: user guide (`docs/USER_GUIDE.md`), updated architecture and data model docs, and a roadmap status update.
- Tag a release with a signed Android APK/AAB and a static web build.
- **Done when:** a fresh install → onboarding → full loop works on both Android and web without console errors.

---

## Stretch backlog (pull in any wave with slack)

- **Energy check-in:** a quick 1–5 energy tap in the morning that biases pick suggestions.
- **"Waiting for" tracker:** tasks blocked on other people, with follow-up dates.
- **Templates for recurring chores:** e.g., property-maintenance checklists that spawn tasks on a schedule.
- **Context lists:** "@hardware-store", "@computer", "@phone", so you can batch errands when you're already out.
- **Location reminders** (Android, flagged): surface @-context tasks near saved places.
- **Focus soundscapes:** simple generated noise or bell loops during sessions.
- **Plain-text mirror:** optional export of tasks to a todo.txt or markdown file for portability.
- **LLM eval harness:** a fixed set of 20 messy tasks, run against each configured provider to compare decomposition quality and estimate calibration over time. This supports Wave 4's "which model is best calibrated for me."

## Definition of done (every wave)

- [ ] Typecheck, lint, unit tests, and e2e tests pass
- [ ] Any schema change has a Dexie migration plus a fixture-based migration test
- [ ] No AI write without user confirmation
- [ ] Works offline (AI features degrade gracefully)
- [ ] Android build runs a smoke test (launch, capture, start timer)
- [ ] `docs/waves/wave-NN.md` and CHANGELOG updated
- [ ] `docs/ROADMAP_STATUS.md` updated
