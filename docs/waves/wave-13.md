# Wave 13 — Analytics and calibration (part 1: pure functions)

**Status:** PR 1 of 3 (this PR: pure functions + the 90-day oracle; no UI) · **Roadmap:** `chrono-kata-roadmap.md` Wave 13
**Status map:** `docs/ROADMAP_STATUS.md` W13

## Shipped (PR 1)

- `src/lib/insights/analytics.ts` — pure analytics over work history:
  - `estimateAccuracy` — the actual/estimated ratio distribution overall and
    per domain, per energy level, and per estimate source (the latest estimate
    per task+source wins; stale revisions are ignored). Ratios clamp to
    [0.1, 10] (documented) so one wild task cannot distort the spread.
  - `calibrationFactor` — the personal factor: the MEDIAN of the user's own
    ratios over completed tasks, null below 5 samples (`not-enough-data`; the
    UI must say so plainly). Reads only; it never rewrites an estimate.
  - `timePerDomain`, `projectTimeInvested`, `cadenceAdherence`,
    `inboxThroughput` — with the SHARED attribution and week rules:
    `sessionProjectId`/`projectOfTaskIndex` from `planning/cadence` (explicit
    session project wins, else the task's project) and `mondayOf`/
    `weekKeyFor` from `review/week`, so analytics and the review can never
    disagree about attribution or week boundaries.
- `tests/unit/insights/w13-fixtures.ts` — a seeded 90-day synthetic history
  with known ground truth: the user underestimates at 0.7x (ratio 1.43),
  model A overestimates 1.3x (with stale revisions that must be ignored),
  model B is exact; three domains, cycling energies, two cadenced projects,
  captured-but-never-processed inbox tasks.
- `tests/unit/insights/w13-analytics.test.ts` — the oracle: per-source medians
  recover the baked-in biases exactly; the calibration factor is the user
  median; robust to an injected 50x outlier; per-domain minutes add up to the
  attributed total; identical results over shuffled input; six zones agree on
  every zone-independent number; cadence weeks sum back to session counts.

## Choices where the roadmap was silent

- `actual` is recomputed from attributed sessions (an export of derived data,
  never a writer of it) rather than trusting `Task.actualMin`.
- "Latest estimate per source" breaks ties on createdAt then id, so imports
  with equal timestamps stay deterministic.
- Quantiles are nearest-rank; the median averages the two middle values.
- Inbox throughput uses the CURRENT status ("processed" = no longer in
  `inbox`); transition history is not stored, so a task that left and returned
  counts as unprocessed — documented, not guessed.

## Deferred

- PR 2: the Insights cards + CSV/JSON export (same download→share→clipboard
  chain as the calendar export). PR 3: the opt-in calibration setting
  (SettingsSchema field + backup round trip via the completeness oracle) and
  the raw/calibrated display.

## Not tested / known gaps

- No UI in this PR, so no a11y sweep or screenshots yet (PR 2).
- The oracle's ground truth is exact ratios from construction; real-world
  half-minute rounding is covered by the tolerance, not by fixtures.
