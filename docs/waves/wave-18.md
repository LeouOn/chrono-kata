# Wave 18 — Backup, export and optional sync

**Status:** all four parts (the completeness oracle and its fixes; the import preview with merge or replace, hostile-file refusal and date repair; the encrypted backup; automatic copies with restore, and the sync decision), behind `taskInbox` · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 18
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

## Part 3: the encrypted backup

WebCrypto only: no dependency, and nothing here talks to any server. Behind `taskInbox`, in the same card:
**Export encrypted…** saves a file that needs a passphrase to open; choosing such a file in **Import JSON…**
asks for the passphrase first and only then shows the same preview as any other backup.

### The file (`src/lib/data-transfer/encrypted.ts`)

A small JSON document, so it survives email, sync and a text editor:

```
{ "format": "chrono-kata-encrypted-backup", "version": 1,
  "kdf":    { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64, 16 bytes>" },
  "cipher": { "name": "AES-GCM", "iv": "<base64, 12 bytes>" },
  "data":   "<base64 ciphertext + 16-byte tag>" }
```

- **Key**: PBKDF2-HMAC-SHA-256 of the NFKC-normalised passphrase (the same words typed on another keyboard or
  in another Unicode form open the file), 600,000 rounds, a fresh random 16-byte salt per file, 256-bit key.
- **Cipher**: AES-256-GCM, a fresh random 12-byte IV per file, 128-bit tag. The header (in one fixed spelling)
  is bound to the ciphertext as the GCM additional data, so changing ANY byte of the file, header included,
  fails to decrypt.
- **Plaintext**: `{ "backup": <the envelope>, "secrets"?: { llmApiKeys, googleToken, icsSubscriptionUrl } }`.
  `secrets` exists only when the person ticked the box.
- **Reading is bounded**: the number of rounds must be 100,000 to 2,000,000 (a hostile file cannot make the
  device compute for minutes, and it is refused BEFORE any key is derived), the header takes exactly the
  documented fields, the salt and IV must be exactly 16 and 12 bytes, and the text limit (64 MB) and the
  `__proto__` refusal of every other backup apply.

### Failing closed

A wrong passphrase and a changed file are the SAME failure with the SAME sentence ("That passphrase doesn't
open this file, or the file has been changed. Nothing on this device was changed."), so nothing is learned
about which, and nothing about the contents: only the file's size and the format name are visible. The
passphrase is never stored, logged, put in an error message or in the page, and the field is emptied after a
failed try. There is no recovery: if the passphrase is lost the file cannot be opened, and the form says so
before the file is made.

### The secrets box

Its label is exactly "Also include my API keys, Google sign-in and private calendar link in this encrypted
file", with "Ticked, anyone who has both this file and the passphrase can use them" under it. **It is off every
time the form opens and is never remembered.** Unticked, an encrypted file follows the plain rule (nothing
secret inside). Ticked, `collectSecrets()` puts in the keys of providers set up in the browser (not providers
found from the device's environment), the Google sign-in, and the calendar link, and the file's own list of
what it leaves out no longer claims it leaves those out (`withoutIncludedSecrets`).

**Only Replace brings secrets across.** "Add what is missing" never changes settings or credentials, so it does
not apply them and the preview says so. Replace restores them with the records they belong to: the file's
keys, sign-in and calendar link win over the device's; unticked files change none of the device's.

### Tests

- `encrypted.test.ts`: **known answers made by an independent implementation** (Python `hashlib` +
  `cryptography`): two complete files (100,000 and 600,000 rounds; one with a passphrase typed in decomposed
  Unicode with a no-break space) are reproduced byte for byte and opened; NIST SP 800-38D test case 4 and the
  published PBKDF2-HMAC-SHA-256 vectors against the runtime's primitives; 60 files of the same backup have 60
  different salts, IVs and ciphertexts; **every byte of the salt, the IV and the ciphertext (tag included) is
  flipped in turn** and each is refused with the one sentence; rounds ±1, a byte added or cut, swapped parts,
  another file's ciphertext, and a ciphertext made without binding the header are refused; extra, missing and
  mistyped header fields, out-of-range rounds (with a spy proving nothing was derived), malformed base64 and
  wrong lengths are refused; the passphrase is not in any console call, error, outcome or file.
- `encrypted-roundtrip.test.ts`: the plain oracle's datasets (every table, every optional field, six zones,
  full and sparse) through **seed, export, encrypt, wipe, decrypt, import, compare**, with the box ticked
  (everything identical, secrets included, except the two documented omissions: waiting calendar updates and
  environment providers) and unticked (the plain rule); a device that already holds other credentials; a wrong
  passphrase changes nothing anywhere.
- `encrypted-ui.test.tsx` (the real card) and `tests/e2e/w18-encrypted.spec.ts` (a real browser at 390x844:
  save with the box ticked, open on a brand-new device, wrong passphrase first, then both devices hold the
  same data and the same secrets; a changed file and a wrong passphrase are the same refusal and change
  nothing; password fields, no sideways scroll, every target at least 44 px; flag off has no encrypted
  export).

### What part 3 does NOT cover

- **Offline guessing.** 600,000 PBKDF2 rounds slow a stranger who has the file, they do not stop one. A long
  passphrase is the protection; the form asks for 8 characters and does not rate strength.
- **Size.** The ciphertext is as long as the backup, so the file's size says roughly how much data there is.
  No padding.
- **Memory.** The passphrase is a JavaScript string while it is typed and used; a page cannot wipe it.
  Browser autofill and the clipboard are the browser's business (the fields are `new-password` /
  `current-password`).
- **Argon2** is not in WebCrypto and a dependency was ruled out.
- Engines other than Node's and Chromium's WebCrypto, and an Android device, are untested.
- **Rotation and restore from automatic copies**, and `docs/SYNC_DECISION.md`, are part 4.

## Part 4: automatic copies, restore from any, and the sync decision

Behind `taskInbox`. A **Copies on this device** card in Settings, and a background copy once a day.

### Where copies live, and what that does and does not protect

In a database of their own, **`chrono-kata-copies`** (`src/lib/copies/copies-db.ts`), with its own tiny Dexie
instance and one store. It is **not a table of `chrono-kata`**: the app's Dexie version did not move, copies are
never part of an export (a copy inside every backup would double each one), and the completeness oracle's list of
tables is unchanged. The one thing both databases share is the browser profile, so the screen says, in these
words, always: *"These copies are kept in this browser, next to your data. They protect you from a bad import or a
mistake, not from the browser clearing its storage. Save a file as well."* A copy follows the **plain rule**: no
API keys, no sign-in, no calendar link.

### The rules (each one a bug class already met)

1. **One source of truth for "the last copy"**: the newest `madeAt` in the copies database. No second record
   (nothing in localStorage, nothing in settings) exists to disagree with it. Tested by deleting the newest
   copy and by clearing localStorage.
2. **One automatic copy per LOCAL day, however many tabs ask.** The fast check is repeated inside the one
   transaction that writes, and IndexedDB serialises transactions on the same store across tabs. Tested with
   eight simultaneous callers (one copy), and for a stretch of days around each zone's clock changes, in six
   zones (exactly one copy per calendar day, on that day).
3. **A copy that cannot be made says so.** A failed automatic copy is remembered and shown on the card ("The last
   automatic copy could not be made: There isn't room left on this device to keep another copy."); a failed
   copy before an import **stops the import** with the reason, and the person can choose "Import without a safety
   copy". Nothing proceeds silently.
4. **Compressed and bounded.** gzip when the browser can (stored plain, honestly, when it cannot), the newest N
   kept (3, 7, 14 or 30; default 7; a device-local choice, not in a backup) and all copies together within 100 MB.
   The oldest go first and the newest is never the one dropped. Lowering N prunes at once and says so.
5. **Idle and flagged.** `AutoCopyRunner` waits for `requestIdleCallback` (a 5 s timer where there is none),
   runs again when the tab comes back to the front, and with the flag off schedules nothing and opens nothing
   (tested: the copies database is not even created). A device with nothing of the person's on it (the four
   default life areas do not count) makes no automatic copy.
6. **A copy writes nothing to the app's data.** `collectAll({ createDefaults: false })`: a record the device
   never had (settings, streak, AI settings) is simply absent from the copy instead of being created by it.
7. **Same plain rule, same preview.** "Look at this copy…" opens the SAME preview as importing a file (add what
   is missing, or replace), with the copy as its source. Nothing is applied without it.
8. **Clear all data clears the copies**, whatever the flag says (a wipe that left the data behind in copies would
   not be one). With the flag on, the card says so.

### Undoing a bad import

Right before **every** import (add or replace) a copy of what is on the device is made ("made just before an
import"), unless the device is empty. Restoring that copy from the list puts the state back. The tests do exactly
this: damage the data, restore the earlier copy, and the data is what it was, with the damaged state itself kept
as a copy.

### The words

"Last copy: today." / "yesterday." / "12 days ago." / "No copy yet." Never "overdue", never an exclamation mark
(a test pins the wording).

### Tests

`tests/unit/copies/copies.test.ts` (what a copy holds and that putting it back is identical on the oracle's
datasets; no secret inside; compression and its fallback; a damaged copy reads back as nothing; rotation by count
and by size; the single source of truth; the daily rule in six zones; eight simultaneous tabs; failures; the
read-only guarantee), `copies-ui.test.tsx` (the card, the idle runner, the safety copy and what blocks it,
restore from a copy, Clear all data), and `tests/e2e/w18-copies.spec.ts` (a real browser: make a copy, wreck
the data, restore from the copy, the export is the one from before; the idle copy appears once; Clear all data
removes the copies; a phone layout; flag off).

### What part 4 does NOT cover

- Copies share the browser profile with the data. They do not survive the browser clearing its storage or the
  profile being deleted: only a saved file does. The card says so.
- No automatic copy to a file or a cloud (the browser cannot write files unasked, and `android/` is out of this
  wave's reach). `docs/SYNC_DECISION.md` records the decision on sync and stops there: nothing is built.
- Copies are not encrypted: they hold what the app's own database holds, in the same place.
- Real storage quotas are only simulated (a rejected write); Android is untested.

## Equivalent mutants (the ledger)

Mutants that were applied to the real source and could not be killed, because the changed code cannot change
any behaviour. Listing them is what makes "all killed" mean something: each is a deliberate non-test.

| Where | Mutant | Why nothing can tell it apart |
|---|---|---|
| `DataTransfer` selection counter | removing the bump on the passphrase prompt's "Not now" / on the preview's "Not now" | "Not now" is disabled while an open is running, and the preview cannot be on screen while a prompt is: both bumps are unreachable defence in depth (found by the reviewer) |
| `MilestoneCelebration` fix (#68) | `Math.min` instead of `Math.max` over the newly earned milestones | `computeStreak` records only the highest milestone a recompute crosses, so there is never more than one to choose between; `max` stays the right answer if that changes |
| `dates.ts` (part 2) | an unreadable *core* date kept as the raw text instead of skipping the row | the schema rejects the leftover string, so the row is skipped either way (replaced by a stronger mutant that invents a time) |
| `dates.ts` (part 2) | the "optional field that is a stamp for a done task" branch | the stamp pass handles that field in every case; the branch was redundant and was deleted |
| `encrypted.ts` | the explicit "ciphertext shorter than a tag" check; strict base64 pattern | decryption fails the same way, with the same sentence, whether these checks run or not |
| `import.ts` row loop | skipping a row that is an array before reading it | a list is rejected by the schema anyway; the check only avoids copying a huge array |

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

### Part 3 decisions, for review

10. **600,000 PBKDF2-HMAC-SHA-256 rounds** (the current OWASP figure), accepted range 100,000 to 2,000,000 on reading.
11. **Passphrase**: at least 8 characters, NFKC-normalised, asked twice, no strength meter, no recovery.
12. **Only Replace applies secrets**; Add never changes settings or credentials.
13. Providers found from the device's environment are never put in an encrypted file, even when the box is ticked.
14. The file is named `chrono-kata-backup-DATE.encrypted.json` and is recognised by its `format` field, not its name.
15. A stored `null` for the calendar link now travels as `null` in a plain backup (only the link itself is
    stripped), so a round trip is identical for that field too.

### Part 4 decisions, for review

16. A separate database `chrono-kata-copies` (accepted by review before the work started).
17. One automatic copy per **local calendar day**; copies made by hand and before imports count toward the N kept.
18. Choices of 3, 7, 14 or 30 copies, default 7; 100 MB for all together.
19. A copy is made before every import (add as well as replace) unless the device is empty.
20. `docs/SYNC_DECISION.md`: if sync is ever built, build the file-based encrypted change log, not a CRDT.

