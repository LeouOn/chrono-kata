# Wave 7 — Time blocking and the day timeline

**Status:** part 1 (pure layout core) complete · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 7
**Status map:** `docs/ROADMAP_STATUS.md` W7

Three PRs: 1) this one, the pure layout core; 2) the day timeline (read, add
commitments, apply a proposal); 3) drag/resize, conflicts and replan-from-now.
No UI, no DB writes and no LLM in this part.

## Shipped (part 1)

- `src/lib/planning/layout.ts`:
  - `snapToStep(instant, stepMin, mode)` — nearest / up / down.
  - `moveBlock(block, delta, window, step)` — snaps, keeps the duration, clamps
    to the waking window.
  - `resizeBlock(block, edge, target, window, step)` — snaps, never shorter than
    one step, clamps to the window.
  - `proposeLayout({ picks, window, fixedBlocks, anchors, now, step })` —
    proposes focus blocks for the picks that fit and returns the rest as
    `unplaced`: never overlaps a fixed commitment, never overlaps an anchor
    unless the pick belongs to that anchor's domain, never starts before `now`,
    keeps at least a 5-minute gap, sizes the block as the estimate (default 25)
    rounded **up** to the step, and is deterministic over input order (picks are
    ordered by energy preference, then `createdAt`, then id).
  - `replanFromNow(...)` — keeps blocks that already started, re-lays the rest
    into the remaining time, returns `overflow`.
  - `detectConflicts(blocks, window)` — overlapping pairs and out-of-window
    blocks with neutral wording.
  - `unionIntervals` exported for reuse by the timeline.
- Tests: unit cases for snapping, moving, resizing, union, conflicts, energy
  placement, minimum gap, round-up and DST days; plus **invariant tests** over
  40 seeded random cases in seven zones (UTC, Los Angeles, Helsinki, Auckland,
  Chatham, Lord Howe, Kiritimati — the latter three cover +12/+13, +12:45/+13:45
  and 30-minute DST) and their 2026 DST-change days, asserting: every block is
  inside the window and on the step grid, no two blocks overlap (and the gap
  holds), no fixed block or foreign-domain anchor is overlapped, every pick is
  placed or unplaced exactly once, placed minutes never exceed free minutes, and
  the output is identical over 50 shuffles of the input.

## Decisions (recorded as required)

- **No new dependency for drag/resize** (PR 3): hand-rolled Pointer Events, one
  path for mouse and touch, `touch-action: none` on the handles only, pointer
  capture, snapping to 5 or 15 minutes. A one-column timeline does not justify
  a DnD library's supply-chain surface.
- **Drag is never the only way**: keyboard (arrows move, Shift+arrows resize)
  and a tap-to-edit sheet with labelled time inputs are required from the start,
  so the timeline is usable with a screen reader and without precise pointing.
- **Proposal only**: `proposeLayout` and `replanFromNow` are pure; the timeline
  shows ghosts and nothing is written until the user applies. Overflow is
  reported calmly ("2 picks went back to your list"), never as a failure.
- **Energy preference v1 is a documented constant**, not a setting:
  high-energy picks prefer finishing before noon, low-energy picks prefer
  starting after noon, both falling back to the earliest slot when there is no
  room. A setting can come later.
- Step default 15 minutes, minimum gap 5 minutes, both constants here.
- Week view is **deferred**: the roadmap's done-when is about the day; a week
  view needs multi-day capacity semantics first.

## Not in this part

The timeline UI, fixed-commitment CRUD, applying a proposal, drag/resize,
conflict UI, replan UI, week view (PRs 2–3), calendar-fed blocks (W8 part 2),
notifications.
