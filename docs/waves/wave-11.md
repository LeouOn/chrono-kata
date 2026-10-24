# Wave 11 — weekly review wizard

**Status:** in progress · **PRs:** #45 (data core), then the wizard, then the
optional AI summary · **Roadmap:** Wave 11 · **Lane:** B

## What shipped (data core)

- `src/lib/schemas/review.ts`: `Review { weekOf, notes ≤ 10,000, statsSnapshot?,
  createdAt, updatedAt }` and the resumable `ReviewDraft { weekOf, step 0–5,
  decisions, updatedAt }`. `weekOf` is the **local Monday** day key
  (`WeekKeySchema` in `src/lib/review/week.ts`), validated as a real Monday, so
  one review per week and no review filed under a day.
- Dexie **v8**: `reviews: 'weekOf'` and `reviewDrafts: 'weekOf, updatedAt'`
  (new tables only — no data upgrade, v7 rows open unchanged). `updatedAt` is
  indexed so a draft started last week is still findable after the week key
  moves on.
- `src/lib/db/review.repo.ts`: `getByWeek` / `getDraft` / `latestDraft` return
  `null` (never `undefined`); `upsert` keeps `createdAt` and any snapshot it was
  not given; `complete` writes the review **and** clears its draft in one Dexie
  transaction (a failure leaves the draft exactly where the user left it).
- `src/lib/review/week.ts`: `weekKeyFor(date)`, `mondayOf(dayKey)`,
  `weekRange(weekOf)` and the `WeekKeySchema` Monday validation. Week boundaries
  are the two local midnights, so DST weeks are 167 or 169 hours and a +05:30
  zone still gets local midnight.
- `src/lib/review/stats.ts`: one pure `summarizeWeek(input)` that produces and
  validates `WeeklyStatsSchema` — domain minutes vs stated intentions (every
  domain, including untouched ones), this week's estimate vs actual, waiting
  tasks, per-project week (sessions, cadence debt, days since touch), moved /
  stalled / practice-only sessions, and minutes that could not be attributed to
  a domain.
- `src/lib/pacing/days.ts`: `daysBetweenDayKeys` (local calendar days) and
  `isDayKey`. "Untouched for N days" is calendar arithmetic, not elapsed
  milliseconds, so it does not shrink on a spring-forward week.
- Backup envelope: `reviews` and `reviewDrafts` ride as **optional** fields;
  the envelope stays `version: 2`. An absent key preserves local rows on
  import; a present one replaces them inside `replaceAll`'s transaction.
- The snapshot is treated as derived data on both paths: an imported review
  whose snapshot no longer matches the (still growing) stats schema keeps its
  notes and loses only the snapshot, counted as `snapshotsDropped`; the write
  path drops a stored snapshot that no longer validates instead of refusing to
  save the review. `saveDraft` also refuses a decisions payload over 64 KB.
- `docs/DATA_MODEL.md`, `src/lib/schemas/CHANGELOG.md` and this note updated.

## What shipped (the wizard)

- `/review` renders `ReviewWizard`: six optional steps in the roadmap's order,
  a text + bar progress indicator (`Step N of 6: …`, real ARIA values), Back /
  Next / Finish, and calm copy everywhere ("waiting", "let it go", no red).
- **Step 1 — clear the inbox** reuses `ProcessMode` (the inbox's own triage
  sheet), so the six outcomes, hotkeys and undo are not re-implemented. Because
  the wizard is a page and `ProcessMode` is the only dialog, the triage hotkeys
  keep working; a nested dialog still wins through #43's dialog-count rule.
- **Step 2 — sweep waiting tasks**: keep / name a new next step / defer / let it
  go, per task, with the same undo the inbox offers. A decision is applied
  immediately (single repository write) and the row stays on screen with its
  decision, so nothing looks deleted. The list is snapshotted when the step is
  entered, so a decision does not make its own row vanish; decisions from an
  earlier visit stay listed.
- **Step 3 — projects**: status (pause / make active), the breadcrumb ("after
  this, do X"), sessions this week, rhythm and how long since the last touch.
- **Step 4 — domain balance**: minutes vs the aim for every domain, with the aim
  editable in place; time that belongs to no domain is reported separately.
- **Step 5 — estimates**: estimated vs actual for the week, how many tasks had
  no estimate, and an explicit "a guess you can refine, not a verdict".
- **Step 6 — shape next week**: minutes per domain for the following week (saved
  as `Review.nextWeekIntentions`), a rhythm per project (`Project.cadencePerWeek`)
  and the review notes (bounded at 10,000 with a live counter).
- **Pause and resume**: every step change and every decision writes the draft
  (`ReviewDraft`), so closing the page keeps the work and reopening resumes at
  the same step. `latestDraft()` is what makes Monday's resume find Friday's
  draft after the week key moved. "Close for now" saves first and goes home; the
  Home card says "Resume your weekly review — in progress: step N of 6".
- **Finish** calls `reviewRepo.complete(...)`: the review (notes, snapshot,
  next-week intentions) and the draft removal land in one transaction. A
  rejected save says so calmly, keeps the wizard usable, and the guard resets so
  Finish can be pressed again.
- **Write discipline**: every decision handler uses a ref guard (not state) for
  in-flight work, catches the rejection with a sentence that says nothing was
  saved, and invalidates the queries that show what changed (`tasks`,
  `projects`, `review`). Writes that change two things at once (defer = a new day
  + `scheduled`) go through the new `taskRepo.updateStatus` in one transaction.
- **Entry point**: a Home card (`ReviewLink`) that names the week and, with a
  draft in progress, the step to resume.

## Decisions where the roadmap was silent

- **One review per week**, keyed by the Monday day key rather than by an id: the
  roadmap's `Review { weekOf, notes, stats }` has no notion of several reviews
  of the same week, and a keyed row makes "resume or edit this week's review"
  a single lookup. Re-reviewing a week edits the same row and keeps `createdAt`.
- **Estimate vs actual is scoped to the reviewed week and derived from the
  session rows.** `Task.actualMin` is a lifetime cache (W9), so comparing it to
  this week's intentions would charge last month's work to this week. The stats
  sum this week's linked session minutes and each measured task's estimate once,
  and report `tasksWithoutEstimate` instead of pretending the estimate was zero.
- **"Stale" is called waiting.** A `next` task untouched for **14 local days**
  is waiting (`WAITING_DAYS`), and a task deferred into the future is not
  waiting at all — it is deliberately parked. This is the shared W10/W11
  definition, kept in the one pure `waitingTaskIds` computation; when Wave 10's
  project stall detection lands, both read this rule rather than re-inventing it.
- **Cadence debt is measured over the reviewed week**, not over the seven days
  before "now": re-opening the same review a month later reports the same debt.
  Paused projects report `cadenceDebt: 0` — they are not trying to keep a rhythm.
- **A session belongs to a project through its task when it has no project link.**
  The "Working on" picker is exclusive, so every Start button opens a session
  with a task id and no project id; counting only `session.projectId` would make
  a project's own task work invisible to its weekly count and its cadence debt.
  `projectForSession` resolves `session.projectId ?? task.projectId`, and the
  cadence call gets sessions resolved the same way (without touching
  `rank-picks.ts`, which Wave 10 owns). Wave 10 will replace this with the
  shared helper; the rule stays the same.
- **Domain balance shows every domain**, including a 0-minute one with a stated
  intention; omitting untouched areas would hide exactly the imbalance the step
  exists to show. Minutes that belong to no known domain are reported separately
  as `unassignedMinutes` rather than silently dropped.
- **The snapshot is a typed schema, not a loose record.** `WeeklyStatsSchema` is
  both what `summarizeWeek` builds and what `Review.statsSnapshot` stores, so a
  stored snapshot can never disagree with the computation that made it.
- **Drafts survive the week key changing.** `latestDraft()` is ordered by
  `updatedAt`, so reopening the wizard on Monday finds Friday's draft instead of
  looking up a week key that no longer exists.

## Tests

- `tests/unit/review/stats.test.ts` (19): Monday week keys including Sunday
  night, a Monday just after midnight, a +14 zone and the year boundary; real
  DST weeks (Helsinki 2026-03-23/10-19, Los Angeles 2026-03-02/10-26, Auckland
  2026-03-30/09-21) at 167/169 hours; local midnights in Asia/Kolkata; weekly
  estimate vs actual with a lifetime cache present; the 14-local-day waiting
  boundary across Helsinki's spring-forward (elapsed time says 13.9 days,
  local days say 14); deferred and non-`next` exclusions; cadence measured on
  the reviewed week and stable when re-run later; moved/stalled/practice-only
  counts; task-linked sessions attributed to their task's project (weekly count
  and cadence both), a session with both ids keeping its own project, an
  unlinked session staying unattributed, determinism over session order and
  schema agreement.
- `tests/unit/review/review-repo.test.ts` (11): `null` reads, non-Monday keys
  rejected without writing, `createdAt` preservation, the 10,000-character
  boundary (10,000 accepted, 10,001 rejected and nothing written), latest-draft
  resume across weeks, step bounds, atomic `complete`, and a **rollback proof**
  (the draft delete throws inside the transaction, the review write is rolled
  back and the draft is byte-for-byte what the user left).
- `tests/unit/review/review-backup.test.ts` (5): realistic multi-item
  export → JSON → parse → `replaceAll` with a twice-imported oracle (importing
  again changes nothing), a legacy file without the new keys preserving local
  reviews, invalid rows skipped and counted, and a present-but-empty list
  clearing local rows.
- `tests/unit/db/migrations.test.ts`: the v7 → v8 case seeds every v7 table
  with multi-item fixtures, proves row-for-row survival (`taskId`/`outcome`/
  `breadcrumb`/`actualMin`/`touchedAt` included), the two new tables start
  empty, and the `updatedAt` draft index orders across weeks.

### Wizard tests

- `tests/unit/review/decisions.test.ts` (7): a corrupt or older draft resumes
  with every valid part — invalid task/project keys, unknown actions,
  out-of-range intentions and over-long next actions are dropped, everything
  else kept; notes are clamped on the normalised value so a stored draft is
  always savable; serialise/parse round-trip; the helpers never mutate.
- `tests/unit/review/steps.test.ts` (5): the six steps match the draft schema's
  bound and the roadmap order; `clampStep` handles negative, NaN and 99; the
  previous week crosses the year boundary; the week label is identical in +14
  and −8 zones; `weekKeyFor` and `weekRange` agree on a DST week.
- `tests/unit/db/task-update-status.test.ts` (5): the field patch and the status
  land together, `touchedAt` moves (so a kept task leaves the waiting window),
  `doneAt` is set exactly on `done`, an illegal transition refuses and leaves
  the row untouched, a missing task is reported instead of written.
- `tests/unit/review/wizard.test.tsx` (9, real Dexie + react-query, only the
  router mocked): a saved draft resumes at its step; **two Finish clicks in one
  act() call `complete` exactly once** and store one review; a rejected finish
  shows "nothing was changed" and the button works again on the next press
  (guard reset); two "Let it go" clicks in one act() write once; deferring
  writes the day and `scheduled` together; **a draft left over from the previous
  week finishes under that week, not today** (the week-rollover resume); an aim
  typed on the balance step is in the draft immediately; redefining a next step
  clears a stale defer date exactly like the inbox's next-action outcome;
  "Close for now" saves the step and navigates home.
- `tests/e2e/w11-review.spec.ts` (6): the Home card opens step 1 and the inbox
  sheet opens/closes inside the step; letting a waiting task go changes only its
  status (read back from IndexedDB), keeps the row on screen, and survives a
  reload at the same step; Back keeps state and "Close for now" resumes at the
  same step from Home; the project step saves a breadcrumb and pauses without
  deleting; finishing writes notes/intentions/snapshot and clears the draft;
  every step fits 390×844 with no horizontal scroll, every control has an
  accessible name, the footer targets are ≥44px and the practice FAB does not
  cover them.

## Deferred / known gaps

- The optional AI summary (reusing `generateWeeklyReflection`) is the third PR;
  nothing in the wizard calls an LLM, and a review is complete without one.
- No history/list screen for past reviews yet; `getByWeek` and `latestDraft` are
  all the wizard needs. A list query needs no schema change.
- Intentions are forward-looking by design: editing them on step 6 shapes the
  next week, while editing them on step 4 re-states this week's aim.
- `ReviewDraft.decisions` is an open record owned by the wizard. It is validated
  structurally (an object) but its keys are not yet typed; the wizard parses what
  it reads. Typing them is deferred until the steps are built.
- No history/list UI for past reviews yet; `getByWeek` is the only lookup the
  wizard needs. A list query can be added without a schema change.
- `summarizeWeek` takes `now` explicitly and reads no clock; the wizard is
  responsible for passing the moment of the review.
