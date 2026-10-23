# Wave 2 — Capture (parser + inbox UI)

**Status:** parser and inbox UI complete behind the `taskInbox` flag · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 2
**Status map:** `docs/ROADMAP_STATUS.md` W2 ("partial" — voice and share target remain)

Wave 2's done-when: a captured item survives an app restart **and** the parser
has ≥ 30 table-driven tests. Both are met: the parser (part 1) has 91 tests, and
the inbox UI (part 2, behind `taskInbox`) stores captures in IndexedDB through
the Wave 1 task repository, verified by an E2E reload test.

## Part 2: capture and inbox UI (behind `taskInbox`, default OFF)

- **Capture sheet**: one line in, one inbox task out; parsed chips show
  domain/estimate/energy/day/contexts; Enter saves, clears and refocuses for the
  next line; unrecognised text (including unknown `#tags`) stays in the title.
- **Entry points**: a distinct "Capture a task" control above the practice FAB
  (practice FAB untouched) and `Ctrl/Cmd+K`. W19's command palette will absorb
  the shortcut later; until then it opens this sheet directly. An inline "Add a
  task" field sits at the top of `/inbox`, so capture is where the user is.
- **Bulk paste**: a multi-line paste switches to a preview; each row can be
  edited or dropped and nothing is written until "Add N".
- **Inbox** (`/inbox`): status `inbox`, newest first, neutral count, calm empty
  state; the Process button is natively `disabled` when empty (asserted).
- **Process mode**: the six outcomes (Do now, Next action, Schedule, Waiting,
  Drop, Make project) with keys 1–6 and `s` to skip, neutral "N of M" progress,
  inline undo for Done/Dropped. The queue derives from the live inbox, and a
  pending query shows "Loading inbox…" rather than claiming the inbox is clear.
- **Persistence**: captures survive a reload (E2E: capture → reload → still in
  the inbox).
- **Accessibility**: Modal focus trap/restore, labelled inputs, 44px controls,
  native disabled state, no colour-only signalling; no red/overdue language.
- **Flag off = nothing new**: no capture control, no Inbox pill, `/inbox`
  redirects home (E2E covers this).

## Part 1: parser

## Shipped

- `src/lib/capture/parse-capture.ts` — `parseCapture(line, { now, domains })`.
  Pure: no DB, no network, no LLM, no `new Date()`; `now` and `domains` are
  injected so results are deterministic and timezone-testable.
- `src/lib/capture/split-bulk.ts` — `splitBulk(text)` and `parseBulk(text, options)`
  for messy multi-line pastes, with a stable `index` per item for a preview UI.
- `src/lib/capture/task-input.ts` — `captureToTaskInput()` / `localDayKeyToDate()`:
  the bridge from a parsed capture to the Wave 1 `TaskInputSchema` contract.
  Dates become local midday `Date`s (never UTC midnight), and an empty line
  yields `null` rather than an invalid row. The bridge is **total**: it uses
  `safeParse` and, if the input ever fails validation, falls back to a
  title-only `TaskInput` so the user's text is never lost and no `ZodError` can
  reach the capture sheet. A day key that does not resolve to a finite `Date` is
  dropped (Zod's `z.date()` accepts an Invalid Date).
- `tests/unit/capture/` — 82 tests: 51 table-driven parser cases (syntax,
  order, repetition, adversarial input), 14 splitter cases, 10 timezone/DST
  cases, 7 task-input contract cases.

## Syntax

| Token | Meaning | Notes |
|---|---|---|
| `#domain` | domain | matched against injected domains: normalized exact name/alias first, then an unambiguous prefix |
| `~20m`, `~1h`, `~1h30m`, `~90m`, `~25 min` | estimate in whole minutes | accepted range 1…10080 (the Task schema's max) |
| `!low` / `!med` / `!high` (also `!l` / `!m` / `!h`) | energy | the `!` must start a word, so `call mum!` is untouched |
| `@context` (repeatable) | context list | `@` must start a word, so `bob@example.com` is not a context |
| `today`, `tomorrow`, weekdays, `next mon`, `in 3 days`, `in 2 weeks`, `2026-11-03` | defer date | emitted as a **local** `YYYY-MM-DD` day key in `deferUntil` |

Everything unmatched stays in the title. The title is never empty: if every
word was a token, it falls back to the raw line.

## Choices where the roadmap is silent

1. **Repeated single-value tokens are last-wins** (`#life … #practice` →
   Practice; `~10m … ~20m` → 20; `!low … !high` → high; date phrases resolve by
   document position, so `tomorrow … in 3 days` → +3 days). `@contexts`
   accumulate in order and de-duplicate case-insensitively (first spelling
   wins). Rationale: later text is the correction.
2. **Unknown `#tag`** (no match) and **ambiguous prefix** (`#h` with domains
   *Home* and *Hobby*) are both reported in `unknownDomainTags` **and** left in
   the title, so the typed text is never lost and the UI can show a "no domain
   matched" hint. Silent removal would hide a typo.
3. **Date phrases set `deferUntil`, not `dueAt`**, following the roadmap's own
   example ("deferUntil = tomorrow"). `dueAt` (a real deadline) is a triage
   decision, not something a shorthand line should set.
4. **Bare weekdays only count as dates when the line ends there.** Weekday
   names are also ordinary nouns, so `Friday night plan` stays a title while
   `review sprint fri` and `review sprint fri.` defer to Friday. `tomorrow`,
   `next mon`, `in 3 days` and ISO dates are unambiguous and work anywhere.
   **Bare weekday includes today** (`fri` on a Friday means today);
   **`next <weekday>` skips today** (`next fri` on a Friday means +7 days).
5. **A token that ends a sentence takes its punctuation with it** (`fri.`,
   `@phone.`, `!high.`), so the title does not collect a dangling full stop;
   punctuation inside a line is untouched.
6. **Estimates are whole minutes** and out-of-range values (`~0m`, `~200h`) are
   not consumed — they stay visible in the title instead of failing validation
   later.
7. **Values the Task schema cannot hold stay in the title**, matching the
   out-of-range-estimate policy: an `@context` longer than 50 characters is not
   a tag (the text stays), and contexts beyond the 10th distinct one are left in
   the title. Duplicate contexts consume no slot. Relative offsets beyond
   36 500 days (100 years) are left in the title rather than producing an
   invalid `Date`.
8. **Title is capped at 200 characters** (TaskSchema max), on a plain slice;
   the raw line is preserved in `raw`.
9. **Bulk splitter**: bullet/number/checkbox markers are stripped (stacked
   markers too), an indented non-marker line continues the previous item,
   blank lines separate, trailing `;`/`,` are dropped but a final `.` is kept.
10. **Domain normalization** lowercases and drops non-alphanumerics, so
   `#career/build` matches *Career/Build*; matching is case-insensitive and
   space-insensitive for the same reason.

## Gates

- Parser tests, default TZ: `vitest run tests/unit/capture` → **exit 0**, 82/82.
- Same under `TZ=Europe/Helsinki`, `TZ=America/Los_Angeles`,
  `TZ=Pacific/Kiritimati` → **exit 0**, 82/82 each.
- `npm run typecheck` → exit 0; `npm run lint` → exit 0.
- `npm run precommit`: 616/616 tests pass, but the run exits 1 on a
  **pre-existing** unhandled-rejection flake (see below), not on a test failure.

## Not tested / not in scope

- UI: quick-capture FAB, `Ctrl/Cmd+K` palette, inbox screen, process mode.
- Persistence ("survives restart") and any repository/Dexie write.
- Voice capture, Android share target, optional LLM cleanup.
- English only: no locale-specific month/weekday names, times of day
  ("at 5pm"), ranges, or recurrence ("every mon"). Recurring phrases would be
  Wave 10/15 material.
- A terminal weekday is always treated as a date, so a title that *ends* in a
  weekday word ("sprint review friday") defers instead of saying "friday".
  Put the weekday anywhere else (or use `next friday`) to keep it as text.
- The bare-weekday rule names the **nearest upcoming day with that weekday**
  (today included), not "the Monday of this calendar week", and it does not
  depend on the locale's first day of the week: a user whose week starts on
  Monday still gets the nearest Monday.
- **A day a time zone skipped cannot be represented.** Pacific/Apia had no
  2011-12-30, so `localDayKeyToDate('2011-12-30')` lands on 2011-12-31. No
  local-day representation can cover a day that never existed on that device;
  this is inherent to local day keys, not a parser defect.

## Pre-existing blockers observed while gating

Both were found on `main` while measuring this PR's gates, and both are fixed
outside it:

1. **Unhandled rejection flake** in the full suite: `AbortError` from
   fake-indexeddb when a test ended with a React Query refetch still in flight
   and `resetDbForTesting()` closed the database. Every test passed; the run
   exited 1 (2 of 3 baseline runs). Fixed by #18; 3 of 3 clean full-suite runs
   after merging it.
2. **`tests/unit/insights/heatmap.test.ts` failed 2 cases under
   `TZ=Pacific/Kiritimati`** (UTC+14) because its fixtures used `10:00Z`
   instants, which are the next local day in UTC+14. Fixed in PR #23 (same
   local-calendar-instant pattern as #11).

## Deliberate choices and limits (backlog, not this wave)

- **Single-step undo**: the sheet keeps one `lastAction`, so only the most recent
  Done/Drop can be undone. A multi-step undo stack is future work.
- **Count filters in memory**: the inbox count is derived by filtering the whole
  task list on each render. Fine for a personal inbox; revisit with Wave 19
  (performance) if lists grow to the thousands.
- **Reduced motion**: the app has no `prefers-reduced-motion` handling anywhere
  today; the new sheet animates like every other modal. App-wide work for W19,
  not solved here.
- **Capture while the sheet is open**: a task captured mid-session joins the
  queue once the app invalidates the tasks query (which every capture path
  does); the sheet shows it on the next render.
- **Modal focus restore**: closing from a step whose input unmounts defeated the
  shared Modal's restore, so the inbox screen and the step's Back button put
  focus back explicitly.
- **Capture over an open form**: Ctrl/Cmd+K opens the capture sheet on Modal
  layer 2, so it can stack over the practice session form; Escape closes only
  the capture sheet, the form below keeps its typed state and focus returns to
  its field.
- **Write failures are spoken**: both sheets show one sentence (`messageOf`,
  shared) in a `role="alert"` line and keep the user's text in the field.
