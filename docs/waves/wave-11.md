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
- `docs/DATA_MODEL.md`, `src/lib/schemas/CHANGELOG.md` and this note updated.

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

- `tests/unit/review/stats.test.ts` (16): Monday week keys including Sunday
  night, a Monday just after midnight, a +14 zone and the year boundary; real
  DST weeks (Helsinki 2026-03-23/10-19, Los Angeles 2026-03-02/10-26, Auckland
  2026-03-30/09-21) at 167/169 hours; local midnights in Asia/Kolkata; weekly
  estimate vs actual with a lifetime cache present; the 14-local-day waiting
  boundary across Helsinki's spring-forward (elapsed time says 13.9 days,
  local days say 14); deferred and non-`next` exclusions; cadence measured on
  the reviewed week and stable when re-run later; moved/stalled/practice-only
  counts; determinism and schema agreement.
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

## Deferred / known gaps

- The wizard UI, its Playwright spec and screenshots are the next PR. Step 1
  (clear the inbox) reuses `ProcessMode`, which is untouched until PR #43 merges.
- The optional AI summary (reusing `generateWeeklyReflection`) is the third PR;
  nothing in this data core calls an LLM, and a review is complete without one.
- `ReviewDraft.decisions` is an open record owned by the wizard. It is validated
  structurally (an object) but its keys are not yet typed; the wizard parses what
  it reads. Typing them is deferred until the steps are built.
- No history/list UI for past reviews yet; `getByWeek` is the only lookup the
  wizard needs. A list query can be added without a schema change.
- `summarizeWeek` takes `now` explicitly and reads no clock; the wizard is
  responsible for passing the moment of the review.
