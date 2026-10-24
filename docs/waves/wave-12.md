# Wave 12 — journal and domain accountability

**Status:** in progress · **PRs:** part 1 (pure logic, schema fields and the write path), part 2 (the
journal, shutdown and template screens), part 3 (export and search) · **Roadmap:** Wave 12 · **Lane:** B

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
  already recorded. The repository loads the tasks this call decides AND every
  task the stored record names, so a stored id is dropped only when its row is
  really gone — loading just the decided tasks made every other recorded id look
  deleted (found by the lead's probe through the real repo, not by the pure
  tests).

## What shipped (part 2)

- `/journal`: a static route with `?date=` (the `/sessions/detail` pattern), behind `taskInbox`. It
  shows one local day with yesterday/today/tomorrow navigation.
- **The entry** starts from the person's template rendered for that day; an existing day opens as it
  was written; domain ticks save with the text. The card re-syncs only when the DAY changes, so a
  refetch after a save never overwrites what is being typed or clears the "Saved" line.
- **The shutdown**: each pick is Done or **Back on the list**, with the note and tomorrow's first move.
  Closing writes the tasks and the day in one transaction, reopens with the stored choices, and offers
  "Save changes"; a repeated close with the same choices writes nothing (the part-1 merge, exercised
  through the UI).
- **The template** is editable in place, importable from a markdown file, and resettable to the
  default; it saves through `updateSettingsWith`, whose merge runs inside the settings transaction.
- **Home** gains a flag-gated Journal card; with the flag off the route redirects home and the card
  reads nothing (a spy proves no journal query).
- Every write catches its rejection, says calmly that nothing was saved, resets a REF double-submit
  guard, and seeds the day cache on success. Nothing in this wave calls an AI provider.

### Part 2 tests

- `tests/unit/journal/JournalScreen.test.tsx` (10, real Dexie, only the router mocked): template
  start; save + reload + domain ticks; one moved and one back; an idempotent second close (row and
  `updatedAt` untouched); two clicks in one act() send one shutdown; a rejected close says so and
  works on retry; a template save keeps other settings; day navigation; a **multi-day oracle** (five
  seeded days each show and save their own entry, nothing leaks); flag-off inertness with a spy.
- `tests/e2e/w12-journal.spec.ts` (5): entry + reload; close the day (tasks and row read back from
  IndexedDB, reopen shows the decisions); `?date=` yesterday with no leakage; flag-off redirect and no
  Home link; a per-screen tripwire (no horizontal scroll at 390×844, names, label-in-name, calm
  vocabulary, 44px targets, floating capture button not covering a control).
- Mutants (reverted to the pre-fix code, each red): shutdown sends no choices; no in-flight guard;
  rejection uncaught; guard never reset; the entry resets after a save; the flag-off link still reads.

### Part 2 gates

- `tsc --noEmit` 0, `eslint src tests` 0, the journal + repo files 73/73 exit 0 in all six zones,
  `npm run build` 0, the new browser spec 5/5 exit 0 (single run; the repeat-each run is the lead's
  gate). Screenshots: `/tmp/qa-w12-shots/journal-day.png`, `journal-closed.png`.

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
- `tests/unit/db/journal-repo.test.ts` (14): null for a missing day; journal save
  creates/updates and keeps `picks`/`createdAt`; oversized text refused without a
  write; a shutdown writes tasks and the day together; the second identical
  shutdown does not rewrite the row; **rollback proof** (a failing task write
  leaves the day and the task as they were); a deleted task skipped; a shutdown
  on a day with no plan; an impossible day key refused; the three record probes
  through the real repository (note-only call keeps both decisions; a later
  one-task call keeps the other; deleting one task drops only that id); and an
  oracle over 14 random calls THROUGH the repository — random decision subsets,
  note edits, task deletions between calls and repeated calls — checking the
  record against a model kept in the test after every call, the task
  status/defer invariants, and that a repeated call leaves the row and its
  timestamp untouched.
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

## What shipped (part 3)

- **Export card**: the day, its Monday-based week or its local calendar month as markdown, built from
  the stored rows each time and handed over with the same order the calendar and error-log exports use
  (native share, then download, then clipboard). The card says in one line what the file is and is not:
  *"This is a readable copy of your journal. It is not a backup."* The button is disabled until the
  entries have loaded, so a fast click cannot export a document that says the range is empty.
- **Search card**: case- and whitespace-insensitive search across the journal, the shutdown note and
  tomorrow's first move, newest first, with a one-line preview and the fields that matched; every hit
  links to `/journal?date=…`. Results are computed by the part-1 pure function, so a multi-word query
  finds an entry whose words span a line break.
- **Bidi controls stripped** in `escapeInline` (the polish queued from part 1's review): U+202A–E and
  the isolate set are removed rather than escaped, so a title cannot visually reverse the text around
  it in a viewer.
- `journalRepo.listAll()` reads every day plan newest first for search and the range export (no index:
  a scan over a few thousand rows).

### Part 3 tests

- `tests/unit/journal/JournalExportSearch.test.tsx` (11): `listAll` newest first; the day/week/month
  exports equal the pure functions byte for byte and their filenames follow the range; the
  "not a backup" line; a failed hand-off says so and the button works again; the day export is
  disabled until the list loads (a held read proves it) and for a day with no entry while its week can
  still be exported; search finds multi-word phrases across a line break and a double space, reports
  the field, links to the day, says when nothing matches, matches nothing for a blank query, and
  searches the shutdown note and tomorrow's first move.
- `tests/e2e/w12-journal.spec.ts` (7): the part-2 cases plus search across days with a line-break
  phrase (link opens that day) and an export that captures the downloaded file and checks its
  headings, quoted journal text, no raw `<`, and the range-specific filename.
- Mutants: export ignores the chosen range; export from a list that has not loaded; search matches raw
  text; `listAll` oldest first; bidi controls not stripped - each red on a named test.

### Part 3 gates

- `tsc --noEmit` 0, `eslint src tests` 0, the journal + repo test files 79/79, `npm run build` 0, the
  journal spec 7/7 exit 0 (single run; the repeat-each run is the lead's gate).

## Known properties and deferred polish

- **A deleted task's id stays in the record until the next write that changes
  it.** `applyShutdown` drops an id only when that write would change the row;
  a note-only call with nothing new returns the stored row untouched, so a task
  deleted in another tab can still be listed until the next real change. The
  export skips ids whose task is missing, and `picks` behaves the same way, so
  the only visible effect is a stale id for at most one save. Accepted rather
  than fixed in part 1: rewriting the row to prune would make every no-op write
  a write.
- **Bidi control characters** (U+202E and friends) are stripped in `escapeInline`
  as of part 3.

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
