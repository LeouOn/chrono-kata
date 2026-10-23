# Wave 9 — Work block → timed session flow

**Status:** parts 1 and 2 complete (behind `taskInbox`) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 9
**Status map:** `docs/ROADMAP_STATUS.md` W9

Part 1 is the data + pure-logic core; part 2 is the flag-gated UI (picker,
end-of-session sheet, breadcrumb display and the actualMin recompute). No LLM.

## Part 2: linked sessions (behind `taskInbox`, default OFF)

With the flag off the practice form, timer and FAB are identical to before (the
existing Playwright specs are unchanged and the new ones assert the picker/outcome
are absent).

- **"Working on" picker** in the session form: optional; lists active tasks
  (inbox/next/scheduled, newest touch first) and active projects. Selecting a
  task sets `taskId`, prefills the activity label from its `nextAction`/title and
  the planned minutes from `estimateMin`; selecting a project sets `projectId`.
  The selection's breadcrumb shows as a calm "Pick up here: …" line.
- **Entry points**: the picker in the form, a **Start** button on each inbox row,
  and **Start now** in process mode after a "Next action" outcome. All open the
  same form pre-linked (a small app-level launcher context); nothing else on Home
  changed.
- **End-of-session sheet** (linked sessions only): outcome `Done / Progress /
  Blocked` (neutral wording; "Blocked is not a failure"), and a "Pick up here
  next time" field. The breadcrumb is required for a project; saving without one
  shows a plain sentence and writes nothing. Saves go through
  `saveSessionWithOutcome`, so session + task + project land atomically.
- **Breadcrumb display**: on the inbox row and in process mode ("Pick up here:
  …") and in the picker. `Task.nextAction` is updated by the outcome plan; the
  UI shows it as the suggestion, never auto-applies anything else.
- **actualMin after edits**: `sessionRepo.update/delete` recompute the task's
  cached `actualMin` from its linked sessions inside the same transaction
  (PR A, #34), so editing or deleting a linked session keeps the number
  truthful; the inbox row shows "Nm logged".
- **Timer**: the existing engine is reused; a task's estimate becomes the
  session's planned minutes via the prefill. The draft stored in localStorage now
  also carries `taskId`/`projectId` (old drafts without them restore as
  unlinked). Pomodoro-style intervals are **deferred**: the timer has no interval
  mode today, and adding one is not W9's job (the bells already exist for the
  soft cap).
- **Accessibility**: the picker, outcome group and breadcrumb are named; the
  session form's pre-existing controls got explicit `label htmlFor` associations
  (Repetitions, Activity label, Notes, manual Minutes) with no visual or
  behavioural change, and a tripwire test in `session-outcome-ui.test.tsx`
  asserts every control in a linked session has an accessible name.

## Known limits (backlog, not this wave)

- **Restoring a backup keeps the file's cached `actualMin`.** Import writes
  session rows directly and never goes through the recompute path, so a stale
  total in an old export stays stale until those sessions are edited. A
  "recompute all task actual minutes" maintenance action is a sensible backlog
  item; it is not built here.
- Single-step undo remains a deliberate choice in process mode.
- A manual `actualMin` override (there is no flag for one yet) would be
  overwritten by any minute-affecting edit; documented in the recompute helper.

## Shipped

- **Session fields** (`src/lib/schemas/session.ts`): optional `outcome`
  (`done | progress | blocked`) and `breadcrumb` (≤ 500 chars). Optional and
  non-indexed, so **no Dexie version bump**; old rows parse unchanged; both
  round-trip through the v2 backup envelope (tested).
- **Pure plan** (`src/lib/sessions/outcome.ts`):
  - `cleanBreadcrumb()` — trims, strips a leading "Pick up here next time:" /
    "Where I left off —" / "Next:" prefix, collapses whitespace, caps at 500,
    never returns null and never throws.
  - `accumulateActualMinutes()` — timed sessions add to `Task.actualMin`;
    fractions keep 30-second precision and are rounded to two decimals.
  - `planSessionOutcome(session, task, project)` — computes the task patch
    (actual minutes, proposed `nextAction`), the target status, the project
    breadcrumb, a **validation result** (project breadcrumb is required) and
    non-fatal warnings (illegal transitions, reps-only minutes).
- **Atomic write** (`src/lib/db/session-outcome.repo.ts`):
  `saveSessionWithOutcome(input, now)` writes the session + conversation, the
  task and the project in **one Dexie transaction** (sessions, conversations,
  tasks, projects). A failing task/project write rolls the session back — both
  directions are tested. A missing project breadcrumb returns
  `{ ok: false, reason }` and writes nothing. Sessions without links take the
  ordinary single-write path, so practice sessions are byte-for-byte as before
  (tested: no task/project rows touched, conversation still created).

## Decisions the roadmap left open

- **actualMin rule:** additive per session, timed sessions only; a reps-only
  session contributes no minutes (there is no time to add) and the plan carries
  a warning. Two decimals of precision.
- **Outcome → status:** `done → done`, `blocked → waiting`, `progress` leaves
  the status alone. Illegal transitions (e.g. `blocked` from a task already
  `done` or `dropped`) are reported as warnings and leave the status untouched
  — the transition matrix stays the single source of truth.
- **Breadcrumb:** required for a project (validation result, not a thrown
  error), optional for a task. When present it is written to
  `Project.breadcrumb` and proposed as `Task.nextAction`.
- **"Propose the next action"** is the pure cleanup above; the optional AI
  polish is deliberately not in part 1.

## Known gap: editing or deleting a linked session

`Task.actualMin` is a **cache** of the timed sessions linked to that task. This
part writes it on session create only; there is no edit/delete path yet (those
stay in part 2, where sessions gain task links in the UI). Once a linked session
can be edited or deleted, `actualMin` would drift by that session's minutes.

The recompute path is already here: `sumSessionMinutes()` (in
`src/lib/sessions/outcome.ts`) derives the value from the session rows. Part 2
should call it **inside the same Dexie transaction as the session edit/delete**
(`db.sessions.where('taskId').equals(id)`) and write the result to
`Task.actualMin`, so the cache can never be stale. If a manual actual-minute
override ever exists, it needs an explicit flag before recompute may overwrite
it — out of scope now.

## Orphaned links

A session can reference a task/project that no longer exists (deleted later, or
a restored backup). That is a data condition, not a failed write: the session is
saved, the link id is kept as history, the outcome updates are skipped, and the
plan carries `linked task/project no longer exists`. A **write failure** is
different and still rolls the whole transaction back.

## Deferred to part 2

End-of-session sheet (actual minutes, rating already exists, outcome radio,
breadcrumb field), the task picker inside the timer, showing the breadcrumb at
the top of a task/project, and the optional AI cleanup. Blocks (W7) and Android
work are out of scope.

## Gates

`npm run precommit`; `tests/unit/sessions`, `tests/unit/db`, `tests/unit/data-transfer`
under default TZ, `TZ=Europe/Helsinki`, `TZ=America/Los_Angeles` (exit codes in
the PR). No UI changed, so the full Playwright suite is expected unchanged and
is run for the record.
