# Wave 10 — Long projects without heroic pushes

**Status:** all three parts: part 3 (the gentle offer and the ten-minute session), part 2 (the project list and page, read-only), part 1 (pure logic + optional schema fields), all behind `taskInbox` · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 10
**Status map:** `docs/ROADMAP_STATUS.md` W10

Three PRs: 1) the pure logic (this part); 2) the project page (a static route
that reads the project from the query string, like `/sessions/detail`, because
Android is a static export); 3) the revive card and the minimum viable session
on Today/Plan and on the project page. Everything user-visible is behind the
`taskInbox` flag; this part has no UI and writes nothing.

## Part 3: the gentle offer and the ten-minute session (behind `taskInbox`, default OFF)

When a project has gone quiet (see "When is a project stalled?" below), **one** small
card offers a way back in, and then the app leaves the user alone about it.

- **The offer** (`ReviveCard`, on Home after the Today card and on the plan screen
  after "Your day"): the project's name, "Last worked 2 weeks ago. Ten minutes is
  enough to keep it going.", its newest "pick up here" note, and three 44 px
  controls: **Start 10 minutes**, **Not now**, **Open project**. Nothing on it says
  stalled, late, behind or missed (tested against the guilt list).
- **The ten-minute session is the existing session form**, opened through the same
  `SessionLauncher.openForLink` with `{ projectId, label, estimateMin: 10 }`. There is
  no second timer. A project-linked session needs its pick-up note to save (W9), which
  is the whole point: touch the project and leave a note. Saving touches the project,
  so it is no longer quiet and the offer goes away on its own.
- **The same button on the project page** ("Start a 10-minute session", for **active**
  projects) whether or not it is quiet. Opening the page still writes nothing; only
  saving the session does. Active only, because the launcher's "Working on" picker lists
  only active projects: for a paused one the form would keep the link in its state but
  show "No link", so the person would see a plain practice session. A paused project's
  page says it is paused and that "Make active again" in the weekly review brings it back.
  (The offer on Home can never reach a paused project: only active ones are ever quiet.)

Restraint is the design (`src/lib/planning/revive.ts`, pure and simulated):

- **At most one offer per local day.** Answering it ("Not now") ends the day's offers.
- **The same project is not offered again for three local days** after it was put aside.
- **Which one:** the first in `detectStalls`' order, the project that went quiet most
  recently (the easiest to pick back up). The consequence, on purpose: the few most
  recent quiet projects take turns, and the longest-quiet ones simply rest. An unpicked
  project rests on the list without guilt; the weekly review is where it is let go.
- **Nothing is changed by the app.** A project is never paused, dropped or marked.
- **State** is one device-local localStorage key (`chrono-kata-revive`): a quiet day and
  when each put-aside project may be offered again. It is a UI nicety, not user data: not
  in the backup, not in the database, tolerant of anything it finds, never throws; losing
  it only means an offer may show once more.
- With the flag off the card renders nothing and reads neither the database nor that key.

Not built, on purpose: no setting for the three days or for turning the offer off
(the preview flag is the off switch), no notification, and no offer for paused,
finished or let-go projects.

## Known property of the W9 launcher (found in W10 part 3, not fixed)

The session form's "Working on" picker lists only **active** projects, but the form keeps the
`projectId` it was opened with in its state (from `initialLink`). For a project that is not active
the select therefore shows "No link" while the state is still linked, so the person sees a plain
practice session that is in fact linked. W10 works around it (the ten-minute button exists for
active projects only, and the paused page says where "Make active again" is), and the tests drive
the real form to pin the select's value (`tests/unit/projects/minimum-session-link.test.tsx`).
It is a follow-up for whoever next touches `SessionLauncher` / `SessionForm`: either list the linked
project in the picker whatever its status, or drop the link from state when the picker cannot show it.

## Part 2: the project list and the project page (behind `taskInbox`, default OFF)

Two static routes (the Android build is a static export, so no dynamic segments):
`/projects` and `/projects/detail?id=<uuid>`, the same query-string pattern as
`/sessions/detail`. Both send the user home with the flag off and read nothing
(spy-proven, asserted after settings arrive). The way in is a **Projects** link
beside Timeline and the plan on the Today card, so nothing new sits in the tab bar.
The page is read-only: opening it writes nothing (tested), so there is nothing to
lose. Revive and the minimum session arrive in part 3.

- **List** (`ProjectsScreen`): active then paused projects, the one worked on most
  recently first. Each row: "Last worked 2 days ago", its rhythm and how this week
  stands, and how many next tasks it has. Finished and let-go projects are left
  off (they rest); their page still opens by URL.
- **Page** (`ProjectDetail`): *What is next* (the newest "pick up here" note and
  a few next tasks), *Rhythm and time* (target, this week, total time, the last 7
  days), and *History*, a timeline grouped by local day, newest first, twenty at
  a time, each entry linking to its session.
- All of it is `src/lib/planning/project-history.ts`, pure and tested before any
  UI: `projectSessions`, `timeInvested`, `projectTimeline`, `projectNextAction`,
  `workedAgo`, `rhythmLines`, `projectSummaries`. It reuses `sessionProjectId`,
  `lastWorkByProject`, `cadenceProgress` and `sumSessionMinutes`, so the page
  cannot disagree with the daily picks, the stall detector or the weekly review.

Decisions:

- **"Sessions" and "breadcrumb history" are one timeline.** Every session is a
  line; the ones that left a note show it. Two near-identical lists would say the
  same thing twice.
- **"Pick up here" is the newer of the project's own note and the latest session
  note.** A session on the project writes its note to the project too, but a
  session on one of its *tasks* (nearly all of them) only writes it to the task,
  so `Project.breadcrumb` is often empty or behind: the page would otherwise say
  "No note yet" above a timeline full of notes. The latest session note wins if
  that session started after the project's note last CHANGED; a note typed in the
  weekly review (newer than the sessions) wins over older sessions.
- **"Last changed" is `Project.breadcrumbAt`, not `updatedAt`.** A first version
  compared the session note with `updatedAt`, which moves on every write to the
  row, so pausing a project in the review or editing its rhythm made an OLD note
  look new and it resurfaced as the page's headline (reproduced by dev.lead in the
  built app). The repository now stamps `breadcrumbAt` only when the note's text
  changes (one place: every app write of a project's note goes through
  `projectRepo.update`/`create`); nothing a caller passes can set it. Rows from
  before the field have no stamp and fall back to `updatedAt` until their note is
  next written, which is the old behaviour for them and no worse. Pinned by a
  permanent test of the repro.
- **One definition of "a task to do next"** (`isNextNow`: status `next`, not deferred
  to later) feeds both the list row's count and the page's list, so a deferred task
  is in neither.
- **Calm wording by construction**, tested against the guilt list: a quiet project
  was "last worked 6 months ago"; a met week is "kept", an unmet one is "n of m";
  a project's status reads Active / Paused / Finished / **Let go**, never "dropped".
- Controls are 44 px and nothing sits under the practice button: the per-session
  link is left-aligned under its note, not at the right edge.

Not in part 2: editing a project's note, status or rhythm (that is the weekly
review's job), the revive card and the 10-minute session (part 3).

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
