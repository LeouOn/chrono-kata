# Wave 6 — Daily planning (part 1: the planning core)

**Status:** part 1 complete · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 6
**Status map:** `docs/ROADMAP_STATUS.md` W6

Pure planning logic: settings defaults, anchor expansion, capacity, pick
ranking and the overcommit check. No screens, no DB writes beyond settings, no
LLM. The morning-plan screen, the Today view and anchor editing are part 2.

**Credit:** the first draft of `src/lib/planning/` came from **m1**, which was
then blocked behind a provider usage limit; it was never run or committed. This
part keeps the parts that held up under audit (the wall-clock/DST helpers,
anchor expansion, the capacity maths) and adds what was missing: tests for
`rank-picks` and `overcommit`, the settings wiring (schemas, defaults, backup
round trip, CHANGELOG), real DST assertions instead of "greater than zero",
ties to concrete defaults so the tests fail if the defaults change, and
mutation checks on every suite. m1's `roadmap/w6-planning-core` branch was left
untouched.

## Shipped

- **Settings** (`src/lib/schemas/settings.ts`): optional `wakingHours`
  (`HH:MM` pair, default **07:00–22:00**) and optional `anchors`
  (`{ id, title, weekdays, start, end, domainId? }`). Optional and non-indexed,
  so **no Dexie version bump**; old rows parse; both round-trip through the v2
  backup envelope (tested). CHANGELOG entry added.
- **`time.ts`**: local day keys ↔ instants, the DST policy in one place,
  waking-window resolution, elapsed minutes.
- **`anchors.ts`**: `expandAnchors(anchors, localDay)` — including the tail of
  yesterday's midnight-crossing anchor — plus `anchorIntervalsOnDay`.
- **`capacity.ts`**: `computeCapacity` → `{ wakingMin, fixedMin, anchorMin,
  freeMin, bufferMin, capacityMin }`. Overlaps are **unioned**, everything is
  clipped to the waking window, buffer is **25% of free time** (Q7), capacity
  never negative, zero capacity is a normal result.
- **`rank-picks.ts`**: up to 3 suggestions with human-readable `reasons`;
  signals are due date (quiet for a passed date), cadence debt over the last 7
  local days, energy fit and domain balance; deterministic tie-break by
  `createdAt` then `id`; one project cannot take more than 2 of 3 picks when
  another project has work; other domains are kept out of an anchor's window.
- **`overcommit.ts`**: `checkOvercommit` with a neutral message, default pick
  estimate **25 minutes**.

## Decisions where the roadmap was silent

- **Overnight semantics.** A waking window (and an anchor) belongs to the day it
  **starts** on. `22:00–07:00` runs into the next morning, and the minutes after
  midnight count towards the day the window began. Anchors are defined on the
  weekday they start on, and `end <= start` means "crosses midnight".
- **DST wall-clock policy.** A nonexistent local time (spring-forward gap)
  resolves **forward by the gap** (02:30 becomes the instant that is 03:30
  local); an ambiguous time (fall-back repeat) resolves to the **first**
  occurrence. Both are tested in `America/Los_Angeles` and `Europe/Helsinki`,
  and a 23/25-hour day gives its real elapsed minutes.
- **Anchors live in settings, not a table.** They are device configuration read
  on every capacity computation, never queried by index, and there are only a
  handful — a table would cost a Dexie version for no query benefit.
- **Default estimate for an unestimated pick: 25 minutes** (the roadmap's "≤25
  min, startable in 5"), stated in the result and tested against a literal so a
  silent default change fails.
- **No gravity, no guilt.** A passed due date raises priority quietly and the
  reason reads `due YYYY-MM-DD`; tests assert the absence of
  overdue/late/behind/missed wording in every reason and message.

## Review findings fixed (PR #37, dev-lead's oracle)

dev-lead reviewed with a brute-force oracle that scans every real minute around
each 2026 offset change and compares the functions in 18 zones. It found four
real defects, all fixed here:

1. **DST resolution east of UTC+12** (`Pacific/Auckland`, `Pacific/Chatham`):
   the ±12h offset sampling put both samples on the same side of a transition,
   so a fall-back time resolved to the *second* occurrence and a spring-forward
   gap landed before it. Sampling is now ±14h (the largest UTC offset), with
   Auckland/Chatham tests; the oracle goes red in Auckland if this is reverted.
2. **Overnight waking windows dropped anchors after midnight**: capacity only
   expanded anchors for the window's start day, so an anchor starting tomorrow
   (or today's cross-midnight tail) inside a night-owl window was lost.
   Anchors for `day` **and `day + 1`** are expanded and clipped to the window.
3. **Anchor minutes were subtracted twice in `rankPicks`**: capacity already
   excludes every anchor, so a task now only *gains* the windows of its own
   domain (`capacityMin + same-domain anchor minutes`). An integration test
   builds capacity and anchors from the same input and feeds both to the ranker.
4. **Due tiers and the cadence window used 24-hour elapsed math** instead of
   local calendar days: a due date at 00:00 tomorrow is not "passed" at 23:00
   tonight, and "last 7 local days" is now a set of local day keys (DST-safe).

**The oracle is now a permanent test** (`tests/unit/planning/oracle.test.ts`,
credited to dev-lead): minute-scanning wall-clock and capacity oracles over
seven zones including Auckland and Chatham, plus the rank integration check.
It runs in well under a second. `bufferPct` is also clamped to [0, 100]
(negative/NaN values could otherwise inflate capacity), with tests.

## Known gaps (backlog, not this wave)

- `rankPicks` drops a task whose estimate exceeds the available time instead of
  suggesting it be broken down (W3); the part 2 UI should offer that.
- Existing settings rows have no `wakingHours` until the user saves once; part 2
  needs a resolve-with-default helper (07:00–22:00) so capacity never falls back
  implicitly.
- The buffer clamp covers the pure function; nothing in the UI can edit
  `bufferPct` yet, so the clamp is a guard, not a feature.

## Part 2, PR A: planning settings and the plan hooks

- **`resolveWakingHours` / `resolveAnchors`** (`src/lib/planning/resolve.ts`):
  the 07:00–22:00 / `[]` defaults in one place, with invalid stored values
  falling back safely. Planning callers no longer read the optional fields ad
  hoc (the known gap from part 1).
- **Planning section in Settings** (flag-gated by `taskInbox`): waking-hours
  time inputs and anchors CRUD — title, weekday chips as a labelled button
  group, start/end, optional domain. An anchor whose end is at or before its
  start says plainly that it crosses midnight (not an error); removing one uses
  a gentle confirm and changes nothing else. Everything saves through
  `settingsRepo`, so backups already round-trip it.
- **`usePlanToday(dayKey?)`**: composes `computeCapacity` (waking window from
  `wakingWindow`, so overnight windows read past midnight; fixed blocks from
  `blockRepo.range` over that window) with `rankPicks` (next tasks, sessions of
  the last 7 local days for cadence, today's domain time derived from linked
  sessions). Every query it adds is `enabled` only with the flag on, so the
  flag-off app does no task/plan work — tested with spies.
- Tests: resolve defaults/invalid rows; settings UI (flag gating, waking-hours
  persistence, anchor add with midnight note, validation, gentle removal, a11y
  tripwire over the dialog); hook wiring incl. capacity numbers, confirmed
  `DayPlan`, recompute on settings change and a settings row without planning
  fields; four mutations each red.

Review fixes (PR #38): waking-hours writes are validated before they reach the
settings row (a cleared time input used to persist an invalid row, and the
importer then dropped the whole settings row on restore); anchor removes catch
write failures; `usePlanToday` memoises the resolved settings, the anchors
handed to ranking are clipped to the waking window through the same
`anchorsWithinWindow` helper capacity uses (an out-of-window anchor could add
availability), and an overnight fixed-block test now pins the waking-window
range read. A Settings E2E covers persistence, the cleared-input case and
removal. Mutations for each of these turn a test red.

The /plan screen, Today card, DayPlan persistence and the end-to-end plan flow
follow in PR B.

## Known gaps

- A time input fires one settings write per change. Fine for now; debounce if it
  ever shows up in telemetry.
- `settingsRepo.patch` still accepts any patch; a repo-level validation of the
  merged row would close this class for every caller, but it could break legacy
  partial patches and is deliberately a follow-up, not this wave.

## Deferred to part 2

The morning plan screen (fixed blocks and anchors shown, picks confirmed or
swapped against capacity), the Today view, anchor editing, `DayPlan`
persistence, suggestions for *when* to schedule a pick (this part ranks, it does
not place), and notifications.

## Gates

`npm run precommit`; `tests/unit/planning` and the settings/backup tests under
default TZ, `TZ=Europe/Helsinki`, `TZ=America/Los_Angeles`,
`TZ=Pacific/Kiritimati` (exit codes in the PR); `npm run build`. Every suite was
mutation-checked: union→sum in capacity, first→second fall-back in time, no
project cap, no tie-break, and a changed default estimate each turn at least one
test red.
