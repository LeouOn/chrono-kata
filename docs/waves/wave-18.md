# Wave 18 — Backup, export and optional sync

**Status:** part 1 of 4 (the completeness oracle and the fixes it found) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 18
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
  "API keys (3)", "Google Calendar sign-in (1)", "The private calendar link (1)", "AI providers set up
  by the device itself (1)" (those are found again on their own device), "Calendar updates waiting to be
  sent (5)". Only things that exist are listed. `parseEnvelope` reads the list back, so the import
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

## Decisions for review

1. **The private calendar link is treated as a secret.** It is the one place this changes what an
   existing user's export contains; the link is not lost on the device it lives on.
2. Calendar updates waiting to be sent are left out and discarded on replace (unchanged behaviour,
   now reported).
3. Habit logs in a file are trusted and restored as written (no rebuild), so a file that carries an
   orphan log restores it. Rebuilding stays for files that predate habit logs.
4. An unusable single-row record is now a `skipped` count and the device's own record stays, instead of a
   silent wipe. No existing test counted `skipped` for such a file.
