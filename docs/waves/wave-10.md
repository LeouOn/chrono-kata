# Wave 10 — Long projects without heroic pushes

**Status:** part 1 of 3 (pure logic + optional schema fields; no UI) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 10
**Status map:** `docs/ROADMAP_STATUS.md` W10

Three PRs: 1) the pure logic (this part); 2) the project page (a static route
that reads the project from the query string, like `/sessions/detail`, because
Android is a static export); 3) the revive card and the minimum viable session
on Today/Plan and on the project page. Everything user-visible is behind the
`taskInbox` flag; this part has no UI and writes nothing.

## Shipped (part 1)

- `src/lib/planning/untouched.ts` — **the one definition of "untouched for N
  days"** that this wave and the weekly review (W11) share: `daysUntouched`,
  `isUntouchedFor`, `WAITING_AFTER_DAYS` (14). Local calendar days built on
  `daysBetweenDayKeys` in `src/lib/pacing/days.ts` (added by W11; there is one
  day-difference helper, not two).
- `src/lib/planning/cadence.ts` — the cadence window (last seven local days,
  today included), `sessionProjectId`, `cadenceProgress`, `cadenceDebt`. The
  ranking still imports and re-exports `cadenceDebt`, so existing callers are
  unchanged.
- `src/lib/planning/stall.ts` — `stallThresholdDays`, `lastWorkByProject`,
  `detectStalls`, and the constants `MINIMUM_SESSION_MIN` (10) and
  `DEFAULT_STALL_DAYS` (7).
- Two optional, non-indexed `Project` fields (no Dexie bump; v7 stays):
  `cadenceBlockMin` (5–240) and `stallAfterDays` (3–365). Both round-trip
  through the backup envelope (tested); rows from before this wave parse
  unchanged.
- `rank-picks.ts` now asks `cadence.ts` instead of owning the window, and its
  private copy of the day arithmetic is gone (it uses `daysBetweenDayKeys`). `usePlanning.ts`
  imports `CADENCE_WINDOW_DAYS` instead of declaring its own `7`.

## Decisions (recorded as required)

### A session belongs to a project through its task

Found by reading the code, not in the roadmap: every **Start** button in the app
(Today picks, Now/Next, the inbox) opens the session linked to a **task** only
(`taskId`), and the "Working on" picker is exclusive (a task *or* a project).
`cadenceDebt` and `projectRepo.touch` only looked at `session.projectId`, so
work done on a project's tasks never reduced its cadence debt and never counted
as touching the project. In practice the planner would keep favouring a project
the user was working on every day, and a stall detector built on
`lastTouchedAt` would have nagged them about it.

`sessionProjectId(session, projectOfTask)` fixes this on **read**: an explicit
`projectId` wins, otherwise the task's project. Nothing is stamped at write
time on purpose: stamping `projectId` onto task sessions would make the project
breadcrumb required for them (W9 part 2 requires it exactly when `projectId` is
set). Reading through the task also repairs history. One consequence to know:
a task moved to another project takes its past sessions with it.

### Cadence by minutes, one block per session

The roadmap's example is "2 blocks/week, 45 min". `cadencePerWeek` already
existed; `cadenceBlockMin` is the block length.

- Without `cadenceBlockMin` nothing changes: each session in the window is one
  block.
- With it, a session earns `min(minutes, blockMin)` of the `blocks × blockMin`
  target, and a reps-only session (no minutes) earns a whole block. Debt is the
  number of whole blocks still missing, rounded **up**.
- A session never earns more than one block, so a three-hour push pays the same
  as a 45-minute block. That is the point of the wave: rhythm, not heroics.
- It also keeps the 10-minute minimum session honest: it counts for 10/45 of a
  block, so it keeps a project alive (stall) without silently satisfying a
  cadence it did not meet.

The window stays a **rolling** seven local days, as the planner has always used
it, not a Monday week: a Monday reset would drop every project's debt to its
maximum once a week. Weeks start on Monday only in the simulations, because
that is how people live them.

### When is a project stalled?

A stall is **derived, never stored**. Nothing changes a project's status when it
goes quiet.

- Only `active` projects can stall; paused, done and dropped ones rest on
  purpose.
- Quiet means no *work* for the threshold number of local days. Work is a
  session on the project or on one of its tasks (by when it ended), a task of
  the project finished, or the project's own `lastTouchedAt`. **Reading,
  sorting or re-planning a task is not work**: the weekly review touches tasks,
  and that must not hide a project that went quiet.
- Threshold: the project's own `stallAfterDays`, or else **twice its usual
  gap** (`ceil(7 / cadencePerWeek)` days), never less than 7. A project keeping
  its rhythm is therefore never flagged: 1 a week is quiet at 14 days, 2 a week
  at 8, three or more at 7. No rhythm and no setting: 7.
- Order: most recently quiet first (the easiest to pick back up), then by id.
  The revive card will show one at a time.
- The global default is a parameter (`defaultDays`) so a settings value can feed
  it later; this part adds no settings field, because there is no UI for it yet
  and `settingsRepo.patch` would store it unvalidated. The per-project
  `stallAfterDays` is the configurable piece.

### `dropped` versus resting (the conflict in the roadmap)

- `'dropped'` stays in `ProjectStatus` (existing rows and backups use it).
- **Nothing in the app ever drops a project by itself.** A project that goes
  quiet is shown the soft revive offer, and otherwise rests on the list.
- A project becomes `dropped` only when the user lets it go in the W11 weekly
  review. User-facing words are **"waiting"** and **"let go"**; the UI never
  says dropped, abandoned, failed or behind, and a let-go project can be brought
  back.
- One shared definition of untouched: `src/lib/planning/untouched.ts`. Tasks
  untouched for 14+ days are "waiting" (`WAITING_AFTER_DAYS`). The timestamp fed
  to it differs by entity on purpose: `Task.touchedAt` for a task (any touch,
  including keeping it in review, is engagement), real work for a project.

## What the tests prove

`tests/unit/planning/` — shared helpers in `w10-helpers.ts` (an `Intl`-based day
oracle that shares no code with the implementation, a seeded generator, the DST
week table, and a sanity test of that table).

- `untouched.test.ts` — 600 random pairs per zone against the oracle, a 14-day
  gap across Helsinki's spring-forward that is under 14×24 elapsed hours, and
  Auckland's 25-hour day.
- `cadence.test.ts` — the arithmetic by hand, and 250 seeded weeks per zone
  against the oracle (midnight edges, DST weeks, task links, minutes mode),
  plus the invariants: order does not matter, an out-of-window session changes
  nothing, a full block lowers the debt by exactly one, more work never raises
  it.
- `stall.test.ts` — thresholds, what counts as work, the boundary day, ordering.
- `w10-weeks.test.ts` — **simulated weeks**, Monday-start, six zones, the
  clock-change weeks: a project on its rhythm (with a day of jitter, late-night
  and just-after-midnight sessions, via a task or directly) is never quiet; a
  project that stops is flagged on exactly its threshold day; and a user who
  follows the day's top two picks through **task** sessions meets every weekly
  cadence once the planner has had a week, while the planner stops favouring a
  project once it has had its week and never fills the day with one project.

## Not in this part (and why)

- No UI, no writes, no new table, no new dependency.
- No settings-level default for stall days (see above).
- No snooze/dismiss state for the revive card: that is the card's decision and
  arrives with it in part 3.
- `projectRepo.staleSince(cutoff)` is elapsed-time based; nothing here uses it,
  and nothing should for a "days untouched" rule.
- Time invested and the breadcrumb timeline for the project page are derived
  from `sessionProjectId` over sessions; they arrive with the page in part 2.
