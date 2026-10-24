# Wave 18 — Backup, export and optional sync

**Status:** parts 1 and 2 of 4 (the completeness oracle and its fixes; the import preview with merge or replace, hostile-file refusal and date repair) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 18
**Status map:** `docs/ROADMAP_STATUS.md` W18

Done when: export, wipe, import restores **everything identically**, proved by a deep-equal test.

Four PRs, in order:

1. **The completeness oracle** (this part): a test that derives the table list and the field list from
   the code and fails when a table is missing from the export or a schema field is lost on a round trip;
   the fixes it found; the secrets rule below.
2. Import preview and merge-vs-replace UI.
3. Encrypted backup (WebCrypto only).
4. Automatic rotation, restore, and `docs/SYNC_DECISION.md` (a document, not code).

No Dexie version bump, no new dependency, nothing in this part is behind a flag: it changes the file the
existing Settings export writes and what the existing Settings import does, and nothing else.

## The secrets rule (decided here, binds PRs 2 to 4)

A backup is the person's own file, so their health data and journal text are in it. Credentials are
different: a file that gets emailed, synced or lost must not be a way into an account.

- **A plain backup never contains a secret.** The secrets are: AI provider **API keys**, the **Google
  Calendar sign-in tokens** (`tokens`), and the **private calendar link** (`settings.icsSubscriptionUrl`,
  which works like a password for the calendar: whoever holds the link can read it).
- **It never drops one silently.** The file carries `leftOut`, a list of `{ id, what, why, count }`:
  "your API keys (3)", "your Google Calendar sign-in", "your private calendar link", "AI providers the
  device set up itself" (those are found again on their own device), "calendar updates waiting to be
  sent (5)" (the `what` text reads inside a sentence). Only things that exist are listed. `parseEnvelope` reads the list back, so the import
  preview (PR 2) can show what a file does not carry, and the export screen can say it too.
- **A restore never takes a secret away from the device it runs on.** Because the file does not carry
  them, replacing data must not remove them: the Google sign-in is kept, an API key is kept for every
  provider the file names without one, and the private calendar link is kept when the file has none. A
  secret the file does carry (a file from before this rule) is restored as written. One consequence is
  deliberate: **"Google Calendar connected" is cleared when the device has no sign-in to go with it**,
  so a restore onto a new device does not claim a connection that is not there.
- **An encrypted backup (PR 3) may include them only if the person ticks a clearly worded box**, such as
  "Also include my API keys, Google sign-in and private calendar link in this encrypted file". Unticked,
  an encrypted file follows the plain rule. The box is off by default and is never remembered.
- Calendar updates waiting to be sent are left out too, for a different reason: they belong to this
  device's sessions and sign-in. Replacing the sessions discards them, as the existing confirmation text
  already says.

## The oracle (`tests/unit/data-transfer/completeness.test.ts`)

It derives what to check from the code, so it cannot go stale the way a hand-written fixture does:

- **Tables come from `getDb().tables`.** Each must have a schema entry (`oracle/tables.ts`) and be either
  in the export or in `LEFT_OUT` with a reason. A table added to the database tomorrow fails the test
  until someone decides whether it is backed up (proved: a mutant that adds a table is killed).
- **Fields come from the Zod schemas.** `oracle/zod-gen.ts` builds rows by walking each schema: in `full`
  mode every optional and nullable field is populated, in `sparse` mode optional fields are randomly
  absent and nullable ones randomly `null`; enum values and union branches cycle across rows. It throws,
  naming the field, on any schema construct it does not understand, so it cannot quietly produce less. A
  second check proves the generated data reached **every leaf path of every schema**, so the oracle
  cannot pass by not looking.
- **The check is a deep comparison, row by row, against Dexie** (`oracle/compare.ts`): dates must be Dates
  and equal to the millisecond, `null` is different from absent, and a failure names the field
  (`dayPlans[2026-09-22].shutdownAt: expected Date(...), got absent`). Seeds 101 and 202, both modes, in
  all six zones (UTC, Europe/Helsinki, America/Los_Angeles, Pacific/Kiritimati, Pacific/Auckland,
  Asia/Kolkata): 24 round trips of 19 tables each.
- **Secrets are planted, then searched for** in the exported text (`SECRET-…` strings in every place the
  app keeps one), instead of trusting a field list.
- Allowed differences are written down in one function (`expectedAfterRestoreOnAnotherDevice`): the
  secrets rule and nothing else.

Companion tests: `restore-rules.test.ts` (what stays on the device, what a file without a record does,
the `leftOut` report, export reads without writing, and the one path that depends on the time zone, six
zones) and `oracle/oracle-selftest.test.ts` (the comparison and the generator, so the instruments are
themselves tested).

### What the oracle found on the first run (against `main`, before any fix)

| Finding | Evidence |
|---|---|
| A day plan whose shutdown had been applied (`shutdownAt`) was **dropped on every import**: the importer's hand-kept date list lacked the field, the ISO string failed `z.date()`, and the row was counted as skipped. | 21 distinct plans missing (each in all six zones); "import skipped 3/4/7 rows of a valid export" |
| The private calendar link was written into every plain backup. | 24 of 24 round trips |
| Every session-derived habit log got **a new id and a new `createdAt`** on import: the whole set was deleted and regenerated after the transaction (not atomic, and not identical). | 108 logs missing, 24 unexpected |
| Absent optional dates came back as `null` (`Session.endedAt`, `Habit.archivedAt`, `Settings.lastStreakFreezeUsedAt`, `Settings.googleCalendarConnectedAt`). | field diffs in `sparse` runs |
| A restore onto a device **wiped the Google sign-in** (`tokens` cleared, never restored) and, with a file that lacked or could not read its settings, streak or AI-settings record, **wiped the device's own** (including every API key). | same-device test; mutants M6, M7 |
| "Google Calendar connected" was restored without a sign-in to go with it. | round-trip diff |
| Export **rewrote the stored AI-settings row** (the repository's `get()` upgrades legacy providers and merges environment providers into it). | mutant M17 |
| The export said nothing about the two tables it never carried (`tokens`, `pendingCalendarOps`). | no `leftOut` |

### What changed, in the code

- `importer`: `shutdownAt` is revived; absent optional dates stay absent (`presentDate`); a single-row
  record that is in the file but unusable is **counted as skipped** and the device's own is kept;
  `replaceAll` no longer clears `tokens`, `streak`, `settings` or `llmSettings` (a `put` replaces them
  when the file has a usable one); the device's secrets are read inside the same transaction; habit logs
  are restored exactly when the file carries them and derived again only for a file that predates them.
- `exporter`: no secrets (above), `leftOut`, and it only reads (the repositories' `get()` is used only
  when a device has no such record yet, which creates the defaults as it always did).
- `ExportEnvelope.leftOut` is a new **optional** envelope field. `CURRENT_ENVELOPE_VERSION` stays 2: an
  older build ignores the field, and a file without it imports as before.

### What the oracle does NOT cover

- **Rows that break a schema** are not generated: the oracle proves valid data survives. Hostile and
  corrupt files (wrong shape, huge, dates as strings, `__proto__` keys), the atomic "Nth write throws"
  guarantee, and merge-versus-replace belong to PR 2 and are tested there.
- **Foreign keys** are not checked: the app does not enforce them, so the oracle seeds random ids for
  most references (only habit logs point at real habits and sessions).
- **Fields the schema does not declare.** Zod strips unknown keys; a column stored in Dexie that no schema
  names would not be seen. (The same holds for the importer, which validates with the schemas.)
- **One browser only**: `fake-indexeddb`. Real IndexedDB limits (quota, a very large file) are not
  exercised. The Settings screen is unchanged and not re-tested here.
- **Small datasets** (5 to 16 rows per table, several seeds). Scale and speed are not measured.
- **Local calendar arithmetic** is exercised in six zones only on the path that uses it (derived habit
  logs). Nothing else in a backup depends on the zone: dates travel as instants.

## Part 2: the import preview, merge or replace, refusal, and date repair

Behind `taskInbox` (the same preview flag as every task screen). **With the flag off the Backup & Restore
card is the old one, word for word**, and a test pins that. With it on, choosing a file shows what it holds
and what each way of bringing it in would do, in sentences with the real numbers, before anything is written.

### The two ways in

- **Add what is missing** (the default, because it cannot take anything away). The rule is the whole rule:
  a row whose key is already on the device stays exactly as it is, whether or not the file's copy differs.
  Rows the device does not have are added. Settings, streak and AI settings are not touched. There is no
  "newest wins": two clocks disagree, and a merge that quietly overwrites an edit is the failure a backup
  tool must not have. The report counts the rows that were already here separately from the rows that
  differed ("5 already here, left as they were (1 differed from the file; yours were kept)").
  Session-derived habit logs are not added a second time under another id when the device already has one
  for that (habit, session). A file from before habit logs gets logs derived for the sessions it adds, and
  no existing log is touched.
- **Replace everything on this device**, which asks a second time, with the numbers: "This will replace 214
  tasks, 1,310 sessions and 12 projects on this device with 180 tasks, 1,200 sessions and 9 projects from
  the file." Kinds the file does not carry are named and left alone. The sign-in, API keys and private
  calendar link stay (the secrets rule above).

Both are one transaction over every table. Nothing is written before it starts: a plan (`planMerge`) only
reads, and `replaceAll` now reads the device's secrets and re-derives legacy habit logs inside the
transaction (before, the re-derivation ran after it).

### What the preview says besides the numbers

What the file leaves out (`leftOut`), how many records could not be read and are skipped, how many were
**repaired** (below), and reviews whose summary this version cannot read. A refused file gets one calm
sentence that ends "Nothing on this device was changed." and stays on the page (a toast would be gone
before it was read). After an export the same card says what the file does not include.

### Date repair: an unreadable metadata date costs the field, never the row

A day plan whose `shutdownAt` is damaged is still the day's journal. Every date of every table has one of
three rules (`src/lib/data-transfer/dates.ts`, tested against the Zod schemas so a date added to a schema
without a rule fails):

| Rule | Which dates | If unreadable |
|---|---|---|
| **core** | a session's `startedAt`, a block's `start` / `end`, a reflection's `periodStart` / `periodEnd` | the row means nothing without it: **skipped**, counted, shown |
| **optional** | `shutdownAt`, `endedAt`, `archivedAt`, `breadcrumbAt`, `dueAt`, `deferUntil`, `editedAt`, a not-done task's `doneAt`, settings' `googleCalendarConnectedAt` / `lastStreakFreezeUsedAt` | the field is **dropped**, the row is kept, counted as **repaired** |
| **stamp** | `createdAt`, `updatedAt`, `touchedAt`, `lastTouchedAt`, a done task's `doneAt`, the streak's and AI settings' times | another readable time of the same row (a done task's finish: when it was last touched), else the time the backup was made; row kept, counted as **repaired** |

An absent field is not an unreadable one: a missing required time still skips the row, as before. Only
dates are repaired. A row that is invalid for any other reason (a number out of range, a bad id) is still
skipped and counted. One consequence to know about: dropping an unreadable `archivedAt` brings an archived
habit back as active, and dropping `dueAt` removes a due date; both are named in the preview's
"repaired" line, never silent. `check-ins.test.ts` used to expect a check-in with an unreadable `createdAt`
to be skipped; it is now kept and counted repaired.

### Refusing a file that is not a backup (`guard.ts`)

Refused before any row is read, calmly, with nothing written: text that is not JSON (the message never
quotes the file), a list or other wrong shape, an unknown version, a `__proto__` key anywhere, text over
64 MB (the card refuses by `File.size` without reading it), and a collection with more than 250,000 rows.
`constructor` / `prototype` keys are ordinary text and are dropped with the other unknown fields. A file
nested absurdly deep parses without crashing and its one "row" is skipped.

### Tests added

`date-repair` (the rule table against the schemas; d1's exact probe; every field of every table damaged one
at a time), `merge`, `atomic` (every write an import makes, in turn, made to throw, replace and merge, both
file shapes, plus a real duplicate-key failure), `hostile`, `preview` (the sentences as text, a guilt-word
check), `import-ui` (the real card, real parser, real database), and `tests/e2e/w18-backup.spec.ts` (a real
browser at 390x844: **export, new browser profile, import by replacing, export again, the two exports are
equal**; a refused file changes nothing; a damaged shutdown time keeps the journal; flag off is the old card;
no sideways scroll; every target at least 44 px).

### What part 2 does NOT cover

- Only dates are repaired. Any other invalid field still skips its row (counted).
- Merge never updates a row that is already here. A person who wants the file's version of a differing row
  must replace.
- The preview is a Settings section, not its own route. The encrypted backup (PR 3) and the automatic copies
  and restore (PR 4) are not here.
- The phone is a 390-wide browser, not an Android device.

## Decisions for review

1. **The private calendar link is treated as a secret.** It is the one place this changes what an
   existing user's export contains; the link is not lost on the device it lives on.
2. Calendar updates waiting to be sent are left out and discarded on replace (unchanged behaviour,
   now reported).
3. Habit logs in a file are trusted and restored as written (no rebuild), so a file that carries an
   orphan log restores it. Rebuilding stays for files that predate habit logs.
4. An unusable single-row record is now a `skipped` count and the device's own record stays, instead of a
   silent wipe. No existing test counted `skipped` for such a file.

### Part 2 decisions, for review

5. **Merge adds only; it never updates a row that is already here** (no "newest wins"). The report says how
   many differed.
6. **"Add what is missing" is the default** in the preview; replace is a deliberate second choice that asks again.
7. **Date repair** as in the table above. The visible consequences (an archived habit comes back active, a
   due date goes) are in the preview's "repaired" line.
8. **Limits**: 64 MB of text and 250,000 rows in any one collection. Far above years of daily use; a file
   above either is refused, not truncated.
9. `check-ins.test.ts` changed meaning on purpose (see above).

