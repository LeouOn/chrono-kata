# Wave 12 — journal and domain accountability

**Status:** in progress · **PRs:** part 1 (pure logic, schema fields and the write path), then the
journal/shutdown UI, then export and search · **Roadmap:** Wave 12 · **Lane:** B

## What shipped (part 1)

- **Schema, additively**: `DayPlan` gains optional, non-indexed `domainChecks`
  (domain id → ticked), `firstActionTomorrow` (≤ 500), `picksDone`/`picksBack`
  (the shutdown's decisions, sorted) and `shutdownAt`; `Settings` gains optional
  `journalTemplate` (≤ 20,000). `journal` (≤ 5,000) and `shutdownNote` (≤ 2,000)
  were already reserved on the day row for this wave.
- **`src/lib/journal/template.ts`**: the default markdown template, rendering
  (`{{date}}`, `{{weekday}}`, `{{domains}}`; unknown placeholders left exactly as
  written), normalisation (line endings, trailing blank lines, never truncating)
  and the file importer (a file that is empty or over the bound is refused with a
  sentence, not silently cut).
- **`src/lib/journal/search.ts`**: case- and whitespace-insensitive search over
  the journal, the shutdown note and tomorrow's first move, newest first, with a
  one-line bounded preview. An empty query matches nothing.
- **`src/lib/journal/export.ts`**: markdown export per day, Monday-based week and
  local calendar month. Every line of user text is blockquoted, so a journal line
  like `# x`, `---` or a backtick run cannot open a heading, rule, table or fence;
  the output is deterministic (rows by date, domains by display order, tasks by
  id) and contains only what the person wrote — no AI text ever.
- **`src/lib/journal/shutdown.ts`** + **`src/lib/db/journal.repo.ts`**: the
  evening shutdown as a pure plan (task status patches + the next day row) and a
  repository that applies it in ONE Dexie transaction. A pick goes **back on the
  list** (`next`, stale defer day cleared), a finished pick is `done`; nothing is
  deleted or duplicated, a decision for a task that no longer exists is skipped,
  and a repeated shutdown is a genuine no-op (no write, `updatedAt` unchanged).

## Decisions where the roadmap was silent

- **No Dexie v9.** The lead's call, and the code agrees: a day plan is keyed by
  its local date, export reads a date range from that key, the new fields are
  optional and non-indexed, and search scans in memory. Ten years of daily plans
  is ~3,650 rows — a scan is cheaper than an index and needs no migration.
- **"Rolled back" is "back on the list".** The stored decisions are `picksDone`
  and `picksBack`; the vocabulary everywhere is "back on the list", never
  overdue/late/missed/failed/behind. The day's `picks` stay untouched as a record
  of what was planned, and the task keeps its id — only its status moves.
- **A pick going back loses a stale defer day**, matching the inbox's "next
  action" outcome: it is a next task now, not a scheduled one.
- **Decisions are stored sorted**, so a second shutdown with the same decisions in
  a different order is still a no-op. A task named twice takes its last decision.
- **Journal text is quoted on export rather than escaped character by character.**
  A blockquote prefix is exact, readable, and impossible to break out of: the
  document's structure can only come from the headings this module writes.
- **The template is settings, not a table.** One markdown string per device, read
  when an entry starts; absent means the app default.
- **Saving a journal is a single-row write**; a shutdown is the only multi-row
  operation, and it is one transaction with rollback.

## Tests

- `tests/unit/journal/template.test.ts` (12): placeholder substitution and
  unknown placeholders; determinism; line-ending normalisation that keeps the
  last line's trailing spaces (a markdown hard break); the bound is measured on
  the normalised value; an empty or oversized import is refused; a blank saved
  template falls back to the default.
- `tests/unit/journal/search.test.ts` (8): case-insensitive matches across all
  three fields, every matching field reported, newest first regardless of input
  order, empty query matches nothing, one-line bounded preview, and a count
  oracle over a 31-day corpus.
- `tests/unit/journal/export.test.ts` (12): a golden day export (nothing extra,
  nothing missing); a calm "no entries" document; hostile markdown in the
  person's text cannot become structure; blank lines stay inside the quote;
  Monday-based weeks across a spring-forward and a fall-back DST week; a
  half-hour zone; a leap February month; determinism under shuffled rows and
  domains; and an oracle over 30 generated days (every entry once, date order,
  every journal line quoted verbatim).
- `tests/unit/journal/shutdown.test.ts` (9): outcomes and status patches, the
  defer-day clear, idempotence (same row, no change), order independence, last
  decision wins, missing tasks skipped, the note/action/journal/domain ticks
  written together, the note bound on the normalised value, a bare day created
  when none exists, and untouched fields left alone.
- `tests/unit/db/journal-repo.test.ts` (10): null for a missing day; journal save
  creates/updates and keeps `picks`/`createdAt`; oversized text refused without a
  write; a shutdown writes tasks and the day together; the second identical
  shutdown does not rewrite the row; **rollback proof** (a failing task write
  leaves the day and the task as they were); a deleted task skipped; a shutdown
  on a day with no plan; an impossible day key refused.
- Mutation list (mutant → killing test): domains placeholder not substituted →
  template render test; unknown placeholders stripped → "leaves unknown
  placeholders"; long text truncated → "refuses text that is longer"; empty
  import allowed → "refuses an empty file"; blank template used as-is → "falls
  back to the default"; normalise trims the last line → "keeps content";
  case-sensitive search → "matches case-insensitively"; unsorted results →
  "newest first"; empty query matches all → "matches nothing for an empty query";
  journal-only search → "across journal, shutdown note and first action";
  unquoted user text → the golden day and hostile-markdown tests; empty days
  exported → the oracle's entry count; month from 30 days of arithmetic → leap
  February; week not Monday-normalised → both DST week tests; domains unsorted →
  determinism; decisions unsorted → order independence; stale defer day kept →
  the outcome test; shutdown never reports unchanged → repo idempotence; deleted
  task recorded → "skips a decision for a task that was deleted"; no transaction →
  the rollback proof (and four more); format-only day key → "refuses an invalid
  day key".

## Gates (part 1)

- `tsc --noEmit` 0, `eslint src tests` 0.
- The five new test files in the DEFAULT zone: 51/51 exit 0 (see the PR message
  for the six-zone run).
- Full suite, six zones, build and Playwright: the lead's gate (no UI in this PR).

## Deferred / known gaps

- No UI yet: the journal and shutdown screens are part 2, and the export/search
  surfaces part 3. Everything is behind `taskInbox` when it lands.
- The markdown export has no download/share helper yet; it returns the text and
  part 3 hands it off (download → share → clipboard, like the ICS export).
- Search scans in memory by design; if a user ever has tens of thousands of
  entries the shape to revisit is a derived index, not this API.
