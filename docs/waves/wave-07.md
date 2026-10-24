# Wave 7 — Time blocking and the day timeline

**Status:** parts 1–2 complete (layout core + day timeline) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 7
**Status map:** `docs/ROADMAP_STATUS.md` W7

Three PRs: 1) the pure layout core; 2) the day timeline (read, add
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

## Shipped (part 2 — the day timeline)

- **`/timeline`** (flag-gated like the rest of planning): one column from the
  waking window to its end, **local** hour lines (not UTC hours: India and Nepal
  would otherwise get :30/:45 lines), a ticking now line, fixed commitments,
  anchors (read-only, tapping one points to Settings > Planning), focus blocks,
  and a plain "nothing fits" state. A proposed layout renders above the day as
  dashed ghosts until Apply; Cancel writes nothing.
- **Nothing is hidden or silently moved**: a clock outside the waking span
  stays on the window's own local date (07:30 in a 09:00-17:00 day is today,
  not tomorrow), and commitments outside the window are listed in an "Outside
  your waking hours" section below the timeline, tappable to edit/remove, with
  a calm note after saving one.
- **Overnight windows are real**: the block sheet maps a clock to the first
  instant at or after the window start with that local clock, so in a
  20:00–02:00 day "00:30" belongs to the next date and 23:00–01:00 saves;
  block queries use the waking window, not the calendar day. A daytime
  11:00–10:00 is still refused.
- **Adding and editing is never drag-only**: "Add a commitment" and tapping any
  block open a labelled sheet (Title/From/Until) with inline validation
  ("The end time needs to be after the start"), a double-submit guard and a
  two-step remove. Fixed-commitment create/update/delete go through
  `blockRepo`; a focus block keeps its task link when its times move.
- **Apply is one action**: `blockRepo.replaceFutureFocus` replaces only the
  day's **not-yet-started** focus blocks with the proposal inside a single Dexie
  transaction; blocks that already started are history and survive a replan,
  and a failure rolls the whole write back. Picks that do not fit are not
  written and stay on the task list. Nothing is written before Apply.
- **A focus block wears its task's name**: the timeline and the sheet read the
  task title through `taskId`, so a rename shows up without rewriting blocks.
  The edit sheet heading is "Focus block for <task>".
- **Today card** gained a Now/Next line with until/at clock and Start (the
  block's duration becomes the session estimate) linked to the same session
  launcher, plus a Timeline link. The strip only considers focus blocks that
  overlap TODAY'S waking window (so tomorrow 09:00 is never shown as Next,
  while an overnight window's after-midnight block still is). One shared
  `useNow()` hook (30 s tick plus
  focus/visibility) drives both that strip and the timeline's now line, so a
  block ending stops reading "Now" without needing another render.
- Tests: `timeline-screen` (flag gate, add once under a double submit, empty
  title and end-before-start write nothing, edit, confirm-remove),
  `timeline-proposal` (ghost then Apply, cancel writes nothing, single Apply),
  `timeline-apply` (two Apply clicks in one act write once),
  `timeline-overnight` (00:30 lands next day, 23:00–01:00 saves),
  `timeline-hours` (Kolkata/Kathmandu local hours, 25/23-hour DST days),
  `timeline-display` (task title on a focus block, anchor note, now-line
  window), `today-now-next` (Now/Next and the block length as Start's
  estimate, never stale after the end), `use-now` (tick and focus),
  `block-replace-future` (started blocks kept, atomic rollback),
  `clock-at-or-after` (DST nights in LA/Helsinki), and
  `tests/e2e/w7-timeline.spec.ts` at 390×844. Hand-rolled geometry stays
  dependency-free; PR 3 adds pointer drag/resize on the same geometry and a
  keyboard/tap path for every move.

## Shipped (part 3 — lanes, editing, conflicts, replan)

- **Overlapping blocks sit in side-by-side lanes** (`assignLanes` interval
  colouring in `layout.ts`, unit-tested: no overlap, two/three simultaneous,
  lane reuse, touching blocks, shuffle independence). The render test asserts
  both blocks are visible, have different left offsets and are tappable; a
  touch E2E taps the lower block, which used to be covered.
- **Pointer drag and resize**: one Pointer Events path for mouse and touch.
  Moving a block body and dragging the top/bottom handles call `moveBlock` /
  `resizeBlock` from the core (nearest snap, grid-safe edges, duration kept);
  release commits, Escape or `pointercancel` writes nothing. A 5/15-minute snap
  toggle is visible. Keyboard: Alt+Up/Down moves, Shift+Alt+Up/Down changes the
  end; the tap-to-edit sheet still does everything, so drag is never the only
  way.
- **Conflicts** are named calmly ("One time overlap" / "Blocks share time
  around 09:00–12:00"); nothing is auto-moved.
- **Replan from now**: when focus blocks exist, the button becomes "Replan from
  now" and calls `replanFromNow` — started blocks stay, future picks are
  re-laid, overflow is shown before Apply ("N picks went back to your list")
  and applied in ONE transaction (`commitLayout`: blocks + dayPlan picks +
  task status `next`), so a failure rolls all of it back.
- **Touch limits of the emulation**: the Playwright `hasTouch` run (390×844)
  proves lane geometry, real tap targets on both overlapping blocks and on the
  resize handles. It does NOT cover a real Android device: OS scroll handoff and
  `pointercancel` during a body drag (body uses `touch-action: pan-y`, so a
  vertical touch swipe scrolls rather than moving a block — moving on touch goes
  through the sheet or keyboard), palm rejection, multi-touch, long-press
  context menus, device pixel ratio/hit-slop, or native rendering performance.
  Resize handles use `touch-action: none` and are the touch drag path.

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

Drag/resize (PR 3), conflict and replan UI (PR 3), week view, calendar-fed
blocks (W8 part 2), notifications.
