# Wave 9 — Work block → timed session flow (part 1: outcome core)

**Status:** part 1 complete · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 9
**Status map:** `docs/ROADMAP_STATUS.md` W9

Part 1 is the data + pure-logic core. No screens, no timer changes, no LLM.
The end-of-session sheet, the task picker in the timer and the "pick up here"
banner stay in part 2, which builds on the flag-gated inbox hooks.

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
