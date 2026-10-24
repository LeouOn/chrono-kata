# Wave 20 — Hardening and release (part 1: error boundaries and a local error log)

**Status:** part 1 · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 20
**Status map:** `docs/ROADMAP_STATUS.md` W20

A render error must never end in a blank screen or a lost afternoon. Part 1 adds
error boundaries on every route, a calm shared screen for them, and a local,
on-device error log with a Settings viewer. No telemetry, nothing is sent
anywhere. (The integrity checker and the loop E2E are later parts.)

## Shipped

- Boundaries: `src/app/error.tsx` (root segment), `src/app/(main)/error.tsx`,
  `src/app/onboarding/error.tsx`, and `src/app/global-error.tsx` for the case
  where the root layout itself throws (it renders its own `<html>`/`<body>`).
- `RouteErrorScreen`: the one calm screen all of them use. No stack on screen,
  no red; it says what happened, that the data is safe, and offers **Try again**
  and **Home** (44 px, the visible text is the accessible name).
- `src/lib/errors/error-log.ts`: a `localStorage` ring buffer (50 entries) that
  never throws, with the route kept as a pathname only (never the query).
- `useRecordError`: one error is one entry. It records in an effect, never during
  render, and once per error object even under StrictMode (which runs effects
  twice in development). A new error object after "Try again" is a new entry.
- `ErrorLogSettings`, behind the `taskInbox` preview flag like the other new
  cards: list, **Export error log**, **Reload error log**, **Clear error log**
  (behind a confirm). The buttons say what they act on because Settings already
  has other Export and Refresh buttons, and existing specs match a name as a
  case-insensitive *substring*: a button named "Refresh error log" would still
  match `{ name: 'Refresh' }` and break `w8-calendar-interop.spec.ts`, so the
  reload button is "Reload error log".

## Privacy, stated as the code behaves

Nothing leaves the device unless the user exports the log. An entry holds the
error's name, message, stack, the route (pathname) and a time. Message and stack
are **truncated, not redacted**: a short message that interpolates the user's own
text (a task title, say) is stored whole and is not flagged. So an entry can
contain short fragments of the user's own text; the card says so beside Export
("Entries can include short fragments of your own text. Read them before you
share the file."). A message cut at 200 characters is flagged "trimmed".

## Checking the boundary in the static (Android) export

The Android build is a static export, so the boundary has to be shown to work
there, not only under `next start`. That check is an opt-in spec,
`tests/e2e/w20-static-export-check.spec.ts`, skipped unless `W20_STATIC_EXPORT=1`
(the normal suite has no server on `:3049`):

```bash
npm run build:android                 # NEXT_EXPORT=true build into out/ (it moves src/app/api aside and back)
python3 -m http.server 3049 -d out &  # plain HTTP, no Next server
W20_STATIC_EXPORT=1 npx playwright test tests/e2e/w20-static-export-check.spec.ts
```

A bare `NEXT_EXPORT=true next build` fails on the pre-existing `/api` route; use
`build:android`. A local build rewrites `public/sw.js`: restore it before
committing. Set `PLAYWRIGHT_PORT` to a free port if 3008 is taken.

## What was actually run (2026-10-24, after round 1 of the review)

- `next build`: exit 0.
- `PLAYWRIGHT_PORT=3058 npx playwright test tests/e2e/w8-calendar-interop.spec.ts
  tests/e2e/w20-error-boundary.spec.ts tests/e2e/w6-planning-settings.spec.ts
  --repeat-each=3`: exit 0, **21 passed**. That includes
  `w8-calendar-interop.spec.ts › rejects a non-https address calmly`, the
  `{ name: 'Refresh' }` locator that the second "Refresh" had broken.
- `npx playwright test tests/e2e/w20-static-export-check.spec.ts` *without* the
  env var: exit 0, **1 skipped**.
- `npm run build:android`: exit 0 (`out/index.html`, `out/settings.html`,
  `out/inbox.html` present); `python3 -m http.server 3049 -d out`; then
  `W20_STATIC_EXPORT=1 npx playwright test tests/e2e/w20-static-export-check.spec.ts`:
  exit 0, **1 passed**: the corrupt-row scenario triggers the boundary in the
  static export, and following its Home link renders the Home screen.

## Not covered

- A real Android WebView / device: the export is served over plain HTTP in
  desktop Chromium, which is the closest thing available here.
- The corrupt-row path is exercised through the inbox; a throw in the root
  layout (the `global-error.tsx` case) has unit tests but no end-to-end path
  without a test-only route.

---

# Wave 20 — part 2: the pure integrity detector

**Status:** part 2 · **Head:** this PR

`src/lib/integrity/detect.ts` is a PURE, read-only detector: it takes a plain
snapshot (sessions, tasks, projects, domains, blocks, dayPlans, habits,
settings) and reports every issue — nothing else. `collectIntegritySnapshot`
is the thin IO shell that reads the live Dexie tables. No UI, no repair here
(part 3 adds the checker screen and the one-transaction tidy-up).

## Severities

- `corruption` — a broken invariant: dangling session/block/task/habit links,
  session `endedAt ≤ startedAt`, block `end ≤ start`, duplicate `calendarRef`,
  `doneAt` XOR `status done` (the invariant a bad write once broke), a
  settings row that fails `SettingsSchema` (the importer drops it whole), and
  far-future dates (> 24h ahead of now).
- `info` — KNOWN, documented properties, not faults: a DayPlan shutdown pick
  (`picksDone`/`picksBack`) whose task was deleted later, and a `domainChecks`
  tick keyed by a since-deleted domain (it is history the user recorded).
  Part 3's tidy-up offers dropping the dead id; detection never calls it
  corruption.

## Choices where the brief was silent

- **Timestamp rules agree with `DATE_SPECS`** (`src/lib/data-transfer/dates.ts`):
  the future-check covers each table's core/optional/stamp date fields exactly
  as that table lists them (`projects.breadcrumbAt` and `dayPlans.shutdownAt`
  included). Ordering checks exist only where a range exists (sessions, blocks).
  A zero-elapsed session (`endedAt === startedAt`) counts as a bad range.
- **`domainChecks` dead keys are informational** (suggested by the lead for
  picks; applied consistently to the domain ticks, which are the same class of
  historical record). Documented here; part 3 decides the tidy-up.
- **No kata-template domain rule**: `KataTemplate` has no `domainId` on main.
- `checkIns` are in no rule (date-keyed, standalone); they stay out of the
  snapshot rather than pretending to be checked.

## Tests

- Oracle (`detect-oracle.test.ts`, the planning-oracle style): seeded random
  databases (mulberry32, seeds 1–60), every corruption and info kind injected
  alone (exactly one issue, correct severity) and in random combinations —
  the detector reports EXACTLY the injected set, no more, no fewer,
  deterministic under row shuffling; both directions of the done/status
  coupling; the exact 24h far-future boundary (23h clean, 25h flagged,
  optional fields included); live picks are NOT dead picks.
- IO shell (`collect-snapshot.test.ts`): rows written through the REAL
  repositories collect cleanly; a raw behind-the-repo write is seen.
- Zones: the two files pass in default, Europe/Helsinki, America/Los_Angeles,
  Pacific/Kiritimati, Pacific/Auckland, Asia/Kolkata (exit 0 each).
- Mutants: 15 attempted, 14 killed, 1 resolved as equivalent-and-removed (the
  unreadable-endpoint guards in the range checks were dead code — `validDate`
  already nulls unreadable values; removed the code rather than claim a kill).
  The lead's real-repository probe (P1–P6) is committed as
  `tests/unit/integrity/lead-probe.test.ts` and passes.

## Round 2 (lead review): five probe findings, all fixed

1. **Planned dates are not events** — the far-future check applies only to
   fields that record what HAPPENED; `tasks.dueAt`/`deferUntil` and
   `blocks.start`/`end` are excluded BY NAME (`PLANNED_DATE_FIELDS`). A task
   due in 30 days, deferred a week, with a block next Tuesday, is clean.
2. **Recurring calendar events share one calendarRef by design** — a duplicate
   is the same ref AND the same start instant (the issue carries `startIso`);
   a three-occurrence series with different starts is clean.
3. **A zero-length session is legal** (SessionSchema has no end>start refine) —
   sessions use `<`, blocks keep `<=` (their schema forbids equality).
4. **The detector is TOTAL** — every field access goes through safe readers
   (`rowOf`/`validDate`/`linkOf`); a fully garbled row is reported, never thrown on.
5. **`row-date-unreadable`** — any DATE_SPECS field present but not a valid
   Date (wrong type or NaN) is corruption; range rules stand down for
   unreadable endpoints (one issue, not two).
6. **One source of truth** — the field lists are DERIVED from DATE_SPECS; a
   set-algebra completeness test plus a BEHAVIORAL completeness test (every
   future-checked field flagged far-future, every planned field clean
   end-to-end) fail if DATE_SPECS and the detector ever drift.

Part-3 copy note (from the review): orphan links must read as "links to
something that is gone" in the UI — never "corruption", never red — and the
info severity stays for the documented DayPlan properties.
