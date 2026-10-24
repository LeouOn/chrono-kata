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
  one-line bounded preview. Both sides are normalised the same way (whitespace
  collapsed, lowercased), so a multi-word query finds text across a line break or
  a double space. An empty query matches nothing.
- **`src/lib/journal/markdown.ts`**: the two text-safety rules. Multi-line user
  text (journal, note, first move) is **blockquoted**; inline user text (task
  titles, domain names) is **flattened and escaped** (markdown specials
  backslash-escaped, `<`/`>`/`&` as entities), because task titles also arrive
  from the share target, the calendar import and AI decomposition — they are
  external text. Rendered markdown shows the original characters back.
- **`src/lib/journal/export.ts`**: markdown export per day, Monday-based week and
  local calendar month. With both rules in place nothing user-controlled can
  create a new line shape: the document's structure is only ever the headings,
  list items and quotes this module writes. The output is deterministic (rows by
  date, domains by display order, tasks by id) and contains only what the person
  wrote — no AI text ever.
- **`src/lib/journal/shutdown.ts`** + **`src/lib/db/journal.repo.ts`**: the
  evening shutdown as a pure plan (task status patches + the next day row) and a
  repository that applies it in ONE Dexie transaction. A pick goes **back on the
  list** (`next`, stale defer day cleared), a finished pick is `done`; nothing is
  deleted or duplicated, a decision for a task that no longer exists is skipped,
  and a repeated shutdown is a genuine no-op (no write, `updatedAt` unchanged).
- **The record merges, it never rebuilds.** The shutdown is edited more than once
  in an evening (the note first, the picks later, one pick changed), so a later
  call starts from the stored `picksDone`/`picksBack`, applies its own decisions
  (a task moves between the lists, never sits in both) and drops only ids whose
  task no longer exists. A note-only call therefore cannot erase what the person
  already recorded.

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
- `tests/unit/journal/search.test.ts` (10): case-insensitive matches across all
  three fields, every matching field reported, newest first regardless of input
  order, empty query matches nothing, one-line bounded preview, and a count
  oracle over a 31-day corpus; a multi-word query across a line break and a double
  space; and a substring oracle over 40 random multi-line entries.
- `tests/unit/journal/export.test.ts` (14): a golden day export (nothing extra,
  nothing missing); a calm "no entries" document; hostile markdown in the
  person's text cannot become structure; blank lines stay inside the quote;
  Monday-based weeks across a spring-forward and a fall-back DST week; a
  half-hour zone; a leap February month; determinism under shuffled rows and
  domains; and an oracle over 30 generated days (every entry once, date order,
  every journal line quoted verbatim); an inline-escaping oracle over hostile
  titles (headings, fences, quotes, rules, raw HTML with a handler, numbered lists,
  `javascript:` links, tabs, zero-width spaces, a lone trailing backslash, 300
  characters) asserting every exported line is one of this module's shapes, no
  raw `<` survives, and the visible text round-trips; and domain names escaped in
  both the export and the rendered template.
- `tests/unit/journal/shutdown.test.ts` (13): outcomes and status patches, the
  defer-day clear, idempotence (same row, no change), order independence, last
  decision wins, missing tasks skipped, the note/action/journal/domain ticks
  written together, the note bound on the normalised value, a bare day created
  when none exists, untouched fields left alone; a note-only call and a
  one-task call preserve the rest of the record; and an oracle over 12 random
  call sequences, asserting after every call that no id is in both lists, every
  `picksDone` id is a `done` task and every `picksBack` id a `next` task with no
  stale defer day, that repeating a call reports no change and writes no new
  timestamp, and that only a deleted task can leave the record.
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
