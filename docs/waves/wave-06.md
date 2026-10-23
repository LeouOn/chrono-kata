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
