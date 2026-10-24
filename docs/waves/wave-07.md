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

## Review fixes and the adopted oracle (PR #40)

dev-lead's independent layout oracle (250 random cases × 18 zones on real DST
days) found four issues, all fixed here:

1. **`replanFromNow` dropped picks whose block was still in the future**
   (`keptTaskIds` was built from every existing block, not just the started
   ones; 352 violations/250 cases). It now subtracts only `kept` picks, so a
   not-yet-started block is superseded and its pick is re-laid; the doc says the
   caller replaces those future blocks. Kept blocks also reserve a gap around
   themselves, so the 5-minute rule holds between a kept and a re-laid block.
   A dedicated replan test file covers kept/re-laid/overflow partition,
   determinism, no-overlap with kept blocks, an ended day and the six DST nights.
2. **`moveBlock` snapped with floor**, making a drag asymmetric (+8 min moved
   0, −8 moved −15) while resize used nearest. It now snaps to the **nearest**
   step; ±7 minutes stays put, ±8 moves a step.
3. **Blocks could land off the step grid at an off-grid window edge** (a
   07:07–22:00 waking window). Move and resize now clamp to the first grid point
   at or after the window start and the last at or before the window end.
4. **The "day is over" branch returned `unplaced` in input order.** It now uses
   the same deterministic order; the shuffle test covers the before/inside/after
   `now` branches.

The oracle is adopted as `tests/unit/planning/layout-oracle.test.ts` (60 cases ×
7 zones including Auckland/Chatham/Lord Howe, completeness and replan-partition
checks), credited to dev-lead. Mutations for each fix turn the intended test red.

## Known gaps

- The step is **5 or 15 minutes**: the grid is anchored at the Unix epoch, which
  equals the local clock grid for those steps in every real zone, but not for
  30/60-minute steps in a +5:45 zone (Nepal). Guard/clamp any other step later.
- The energy split uses local noon of the window's start day, so for an
  overnight window starting in the evening the high-energy rule never applies
  (v1 behaviour).
- The 5-minute gap is enforced between proposed blocks and after kept blocks,
  not next to fixed commitments or anchors. By design.

## Not in this part

The timeline UI, fixed-commitment CRUD, applying a proposal, drag/resize,
conflict UI, replan UI, week view (PRs 2–3), calendar-fed blocks (W8 part 2),
notifications.
