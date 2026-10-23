# Wave 2 — Capture (part 1: parser)

**Status:** part 1 complete (this PR) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 2
**Status map:** `docs/ROADMAP_STATUS.md` W2 (now "partial")

Wave 2's done-when has two halves: a captured item survives an app restart
(part 2, needs the inbox UI and a repository write) and the parser has ≥ 30
table-driven tests (this part). This PR does the second half.

## Shipped

- `src/lib/capture/parse-capture.ts` — `parseCapture(line, { now, domains })`.
  Pure: no DB, no network, no LLM, no `new Date()`; `now` and `domains` are
  injected so results are deterministic and timezone-testable.
- `src/lib/capture/split-bulk.ts` — `splitBulk(text)` and `parseBulk(text, options)`
  for messy multi-line pastes, with a stable `index` per item for a preview UI.
- `tests/unit/capture/` — 70 tests: 44 table-driven parser cases (syntax,
  order, repetition, adversarial input), 12 splitter cases, 2 parser contract
  cases, 10 timezone/DST cases.

## Syntax

| Token | Meaning | Notes |
|---|---|---|
| `#domain` | domain | matched against injected domains: normalized exact name/alias first, then an unambiguous prefix |
| `~20m`, `~1h`, `~1h30m`, `~90m`, `~25 min` | estimate in whole minutes | accepted range 1…10080 (the Task schema's max) |
| `!low` / `!med` / `!high` (also `!l` / `!m` / `!h`) | energy | the `!` must start a word, so `call mum!` is untouched |
| `@context` (repeatable) | context list | `@` must start a word, so `bob@example.com` is not a context |
| `today`, `tomorrow`, weekdays, `next mon`, `in 3 days`, `in 2 weeks`, `2026-11-03` | defer date | emitted as a **local** `YYYY-MM-DD` day key in `deferUntil` |

Everything unmatched stays in the title. The title is never empty: if every
word was a token, it falls back to the raw line.

## Choices where the roadmap is silent

1. **Repeated single-value tokens are last-wins** (`#life … #practice` →
   Practice; `~10m … ~20m` → 20; `!low … !high` → high; date phrases resolve by
   document position, so `tomorrow … in 3 days` → +3 days). `@contexts`
   accumulate in order and de-duplicate case-insensitively (first spelling
   wins). Rationale: later text is the correction.
2. **Unknown `#tag`** (no match) and **ambiguous prefix** (`#h` with domains
   *Home* and *Hobby*) are both reported in `unknownDomainTags` **and** left in
   the title, so the typed text is never lost and the UI can show a "no domain
   matched" hint. Silent removal would hide a typo.
3. **Date phrases set `deferUntil`, not `dueAt`**, following the roadmap's own
   example ("deferUntil = tomorrow"). `dueAt` (a real deadline) is a triage
   decision, not something a shorthand line should set.
4. **Bare weekday includes today** (`fri` on a Friday means today);
   **`next <weekday>` skips today** (`next fri` on a Friday means +7 days).
   Safer than the reverse for "plan the week" phrasing.
5. **Estimates are whole minutes** and out-of-range values (`~0m`, `~200h`) are
   not consumed — they stay visible in the title instead of failing validation
   later.
6. **Title is capped at 200 characters** (TaskSchema max), on a plain slice;
   the raw line is preserved in `raw`.
7. **Bulk splitter**: bullet/number/checkbox markers are stripped (stacked
   markers too), an indented non-marker line continues the previous item,
   blank lines separate, trailing `;`/`,` are dropped but a final `.` is kept.
8. **Domain normalization** lowercases and drops non-alphanumerics, so
   `#career/build` matches *Career/Build*; matching is case-insensitive and
   space-insensitive for the same reason.

## Gates

- Parser tests, default TZ: `vitest run tests/unit/capture` → **exit 0**, 70/70.
- Same under `TZ=Europe/Helsinki`, `TZ=America/Los_Angeles`,
  `TZ=Pacific/Kiritimati` → **exit 0**, 70/70 each.
- `npm run typecheck` → exit 0; `npm run lint` → exit 0.
- `npm run precommit`: 616/616 tests pass, but the run exits 1 on a
  **pre-existing** unhandled-rejection flake (see below), not on a test failure.

## Not tested / not in scope

- UI: quick-capture FAB, `Ctrl/Cmd+K` palette, inbox screen, process mode.
- Persistence ("survives restart") and any repository/Dexie write.
- Voice capture, Android share target, optional LLM cleanup.
- English only: no locale-specific month/weekday names, times of day
  ("at 5pm"), ranges, or recurrence ("every mon"). Recurring phrases would be
  Wave 10/15 material.
- A weekday word is always treated as a date, so a title that *starts* with
  "Monday standup" loses "Monday" into `deferUntil`. Documented limitation.

## Pre-existing blockers observed while gating

Both were found on `main` while measuring this PR's gates, and both are fixed
outside it:

1. **Unhandled rejection flake** in the full suite: `AbortError` from
   fake-indexeddb when a test ended with a React Query refetch still in flight
   and `resetDbForTesting()` closed the database. Every test passed; the run
   exited 1 (2 of 3 baseline runs). Fixed by #18; 3 of 3 clean full-suite runs
   after merging it.
2. **`tests/unit/insights/heatmap.test.ts` failed 2 cases under
   `TZ=Pacific/Kiritimati`** (UTC+14) because its fixtures used `10:00Z`
   instants, which are the next local day in UTC+14. Fixed in PR #23 (same
   local-calendar-instant pattern as #11).
