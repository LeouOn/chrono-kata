# Wave 8 — Calendar interop (part 1: ICS core; part 2: the UI)

**Status:** parts 1 and 2 complete · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 8
**Status map:** `docs/ROADMAP_STATUS.md` W8

Pure ICS export/import for `Block`s. No UI, no file picker, no network, no DB
write, no Google Calendar changes — decision Q3 keeps Google Calendar exactly
as it is and treats ICS as additive.

## Shipped

- `src/lib/ics/ics-export.ts` — `blocksToIcs(blocks, { now, calendarName })`
- `src/lib/ics/ics-import.ts` — `icsToBlocks(text, { now, defaultKind, windowDays, maxOccurrencesPerEvent })`, plus `stableUuidFromString` and `wallTimeInZoneToUtc`
- `tests/unit/ics/` — 64 tests (export 15, import 27, round trip 7, TZ 8,
  review follow-ups 7)
- `tests/fixtures/ics/` — synthetic Google-, Apple- and Outlook-shaped exports,
  plus a broken-VTIMEZONE file, a stale-VTIMEZONE file and a RECURRENCE-ID
  override file

## Time encoding: UTC instants (`DTSTART:…Z`)

`Block.start` / `Block.end` are absolute instants, and UTC is the only encoding
that needs no VTIMEZONE, is accepted by every calendar app, and round-trips to
the identical block if the user moves between time zones or changes the device
zone. The alternatives were rejected deliberately:

- **Floating local time** re-anchors the block to whatever zone the file is
  opened in, so the instant changes — wrong for a focus block that was planned
  for a specific moment.
- **TZID + VTIMEZONE** is also correct and preserves the origin wall clock, but
  requires generating timezone components (with their own DST rules) and buys
  nothing over UTC for an instant we already have.

Import is generous: UTC, `TZID` with VTIMEZONE, `TZID` with an IANA zone name
but no VTIMEZONE (resolved through `Intl`), floating times (read as the device
wall clock, which is what "floating" means), all-day `VALUE=DATE`, and
`DURATION` instead of `DTEND`.

## Round-trip

`blocksToIcs` → `icsToBlocks` restores `id`, `start`, `end`, `kind`, `title`,
`taskId`, `projectId`. Fields that legitimately do **not** survive:

| Field | Why | What import produces |
|---|---|---|
| `createdAt` / `updatedAt` | not calendar data | the injected `now` |
| `calendarRef` | is the UID; export uses it, import writes it back (so it *is* stable across round trips, but a block that had no ref gains one) | the event UID (`<id>@chrono-kata` for exported blocks) |

Kind/task/project travel in `X-CHRONO-KATA-KIND`, `-TASK-ID`, `-PROJECT-ID`;
the original block id travels in `X-CHRONO-KATA-BLOCK-ID`, so a re-import
preserves ids instead of minting new ones. Without those properties, ids are
derived deterministically from UID + occurrence start, so importing the same
file twice is stable. `UID` is `calendarRef` when present, else
`<block.id>@chrono-kata`, so re-exporting updates events rather than
duplicating them.

## RRULE boundary (v1)

Expansion is delegated to `ical.js`'s engine, which covers DAILY/WEEKLY/
MONTHLY/YEARLY with `COUNT`, `UNTIL`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`,
`BYSETPOS`, and honours `EXDATE`. The bounds are ours:

- occurrences inside **[now − 7 days, now + 366 days]** (`windowDays`);
- at most **500 occurrences per event** (`maxOccurrencesPerEvent`);
- a hard **100 000 iteration** cap for pathological rules.

Hitting the occurrence cap emits a `skipped` entry
(`recurrence truncated at N occurrences`); occurrences outside the window are
not errors and are not listed (the result reports the window). A rule the
engine throws on is reported as `unsupported recurrence: …`. Non-recurring
events are imported regardless of the window.

## Dependency decision

**`ical.js@2.2.1`, pinned exactly** (`"ical.js": "2.2.1"`, no caret), MPL-2.0.

- **Why:** hand-rolling VTIMEZONE rule evaluation, DST transitions, DURATION,
  all-day semantics and RRULE expansion is where this module would fail
  silently; ical.js is the reference implementation behind Thunderbird and has
  no runtime dependencies.
- **License:** MPL-2.0 — file-level copyleft, fine for an unmodified dependency;
  no obligation on chrono-kata's own files. It is the only MPL dependency in the
  project.
- **Audit:** `npm audit` reports no advisory for `ical.js` (its only findings
  are pre-existing, dev-only `vitest`/`vite` advisories).
- **Size:** the package's export entry, `dist/ical.js`, is 268 KB raw / **62 KB
  gzipped as installed**; the minified build is 76 KB / 22.9 KB gzipped, which is
  the order of magnitude Vite will add to the app bundle once part 2 imports
  `icsToBlocks`. Today nothing imports the import module, so the shipped bundle
  is unchanged. It is pure JS (no WASM), so it runs offline and inside the
  Capacitor WebView with no network or native access.
- Export is hand-rolled (folding, escaping, CRLF) because it is a small,
  fully-tested RFC 5545 subset and needs no library.

## Fixtures

`tests/fixtures/ics/` are invented, shaped like real exports: `google.ics`
(VTIMEZONE Europe/Helsinki, TZID event across the autumn DST change, all-day
event, weekly recurrence), `apple.ics` (VTIMEZONE America/Los_Angeles, a
fall-back DST crossing 00:30→02:30, a floating event), `outlook.ics`
(Windows `W. Europe Standard Time` VTIMEZONE, DURATION-only event, CANCELLED
event). No real calendar data.

## Gates (exit codes per TZ)

- `npx vitest run tests/unit/ics` → **exit 0**, 57/57 under default TZ,
  `TZ=Europe/Helsinki`, `TZ=America/Los_Angeles`, `TZ=Pacific/Kiritimati`.
- `npm run precommit` → exit 0 (typecheck + lint + full unit suite).
- Full suite: see the PR; the only known red is the pre-existing
  `heatmap.test.ts` failure under `TZ=Pacific/Kiritimati`, fixed separately in
  PR #23.

## Follow-ups from the #26 review — fixed

Post-#27 review recommendation, fixed in #28: an IANA `TZID` resolves through
the tz database even when the file ships a VTIMEZONE (`stale-timezone.ics`
claims +01:00 all year for Europe/Helsinki; the event now imports as 06:00Z,
the same as without any VTIMEZONE). Non-IANA names still use the file's
VTIMEZONE, which is the only source Intl cannot provide.


All four review findings are fixed, each with a fixture and a test
(`tests/unit/ics/ics-followups.test.ts`):

A. **An unknown TZID with a broken VTIMEZONE is skipped, not guessed.** A
   VTIMEZONE is only registered when every observance has a parseable DTSTART
   and a `±HHMM` TZOFFSETTO; an event whose TZID is neither a usable VTIMEZONE
   nor a known IANA zone is reported as `unsupported timezone "…"` and produces
   no block. Fixture: `broken-timezone.ics` (TZID `Nowhere/Land`, garbage
   offsets) → 0 blocks, 1 skip.
B. **`RECURRENCE-ID` replaces the instance instead of duplicating the day.** The
   overridden occurrence keeps its slot identity (and therefore its derived id)
   but takes the override's start, end, title and metadata. An override whose
   original occurrence is outside the import window is imported as its own
   block rather than dropped. Fixture: `recurrence-override.ics` (daily series
   with one moved instance) → 3 blocks, moved time present, no duplicate.
C. **A leading UTF-8 BOM is stripped** before parsing, so Windows-produced files
   import normally (`\uFEFF` + `google.ics` → same blocks as without).
D. **The truncation reason says which cap fired**: `recurrence truncated at N
   occurrences` vs `recurrence truncated at the 100000-iteration cap`.

Also from the review: the dependency size is stated as installed (62 KB gzip for
`dist/ical.js`) with ~23 KB gzip as the bundle estimate once minified, and the
Windows-style VTIMEZONE caveat below is documented.

## W8 UI design note (from the #27 review)

A moved instance (`RECURRENCE-ID`) imports with a **fresh id but the same
`calendarRef`** (the series UID), while the occurrence it replaced keeps its
own derived id. A caller that dedupes on `id` sees a new block; a caller that
dedupes on `calendarRef` sees the same event moved. The Wave 8 UI must pick the
`calendarRef` key when reconciling with Google Calendar or a re-import, and must
not assume an id is stable across a move.

## Not tested / not in scope

- File picker, share sheet, pasted subscription URL fetch, export/import
  screens (Wave 8 UI).
- Persisting `calendarRef` into Dexie (the mapping is pure; a repo write is part
  of the UI work).
- Android native calendar (flagged, later).
- Ambiguous wall times in the repeated DST hour resolve to the **earlier**
  (summer-time) occurrence — both through ical.js's VTIMEZONE evaluation and
  through the tz database; a block whose DTEND is written inside the repeated
  hour is inherently ambiguous. A wall time inside a spring-forward gap is
  shifted backward to the pre-transition offset rather than dropped.
- `Etc/GMT+N` means **UTC−N**, per the POSIX convention (`Etc/GMT+8` is UTC−8).
  The importer follows what the name means; the trap is only for a human who
  writes the name expecting the opposite sign.
- A Windows-style VTIMEZONE can disagree with the real zone rule (Outlook's
  "W. Europe Standard Time" says +02:00 for EU summer time where the real rule
  is +03:00), so those files yield instants one hour off. That is in the file,
  not the parser: Intl cannot resolve a Windows zone name, so the file's
  VTIMEZONE is the only source. **IANA names always resolve through the tz
  database**, even when the file carries a VTIMEZONE, so a stale or wrong
  VTIMEZONE cannot produce a wrong instant for a named zone.
- The exporter was re-read by ical.js (a different implementation), not by an
  independent third-party parser or a real calendar app.
- An override's `RECURRENCE-ID` is matched to an expanded occurrence within one
  second; a series whose occurrence grid changed by more than that (a re-based
  `RRULE`) leaves the override to be imported as its own block.
- `VTIMEZONE` with broken rules falls back to the IANA TZID when the name is an
  IANA zone, otherwise the event is reported as unsupported rather than guessed.
- Multi-calendar imports (`VCALENDAR` with several `VEVENT`s is supported, but
  per-calendar naming/`X-WR-CALNAME` is not carried onto blocks).


---

## Part 2 — the calendar interop UI (Settings > Calendar, behind `taskInbox`)

**Shipped:** Settings > Calendar card — export today/this week fixed blocks as
.ics (Web Share when `navigator.canShare({files})` says yes, download
otherwise, clipboard last); import from a labelled file input or an https
subscription address fetched only on an explicit Refresh; preview with
new/updated/unchanged/skipped counts; confirm writes `kind:'fixed'` blocks in
ONE Dexie transaction. The remembered address is opt-in ("Remember this
address", off by default, https-validated against the stored value).

### Reconciliation: occurrence identity first, calendar identity second

A recurring event shares ONE `calendarRef` (the UID) across many occurrence
blocks, so pass 1 matches by **id** (the importer derives a stable id per
occurrence; our exports carry `X-CHRONO-KATA-BLOCK-ID`), and pass 2 pairs the
leftovers one-to-one by nearest start time within each `calendarRef` group —
a moved occurrence (RECURRENCE-ID override, fresh id) or an edited one-off
updates in place and can never land on a sibling occurrence. An incoming id
that collides with a hand-made block (no `calendarRef`, e.g. our own export
re-imported after a local edit) is skipped as "already in your app", and the
repo re-checks inside the transaction as a backstop. Only calendar-owned
fields (start, end, title, kind) are compared and written; `taskId`/
`projectId` always survive from the local row. A seeded 40-calendar oracle
asserts: unchanged file re-imported → 0 writes and identical DB; one event
moved → exactly one row changes; rows == distinct occurrences.

### Choices where the roadmap was silent

- Subscription fetch: own 15 s deadline plus `AbortSignal.timeout`; refuse on
  declared Content-Length over the 2 MB cap before reading; CORS/network
  failures say "Some calendar providers do not allow this from an app; import
  the file instead."
- "Remember" stores only after validation and reflects what is actually
  stored; editing the address then Refreshing updates the stored value.
- Preview reads the repository (not the query cache) at event time; export
  reads fresh at click time.
- Events removed from the source calendar are left untouched (imports never
  delete; tombstones are a later wave's problem).

### Known gaps

- A response without a `Content-Length` header is read in full before the 2 MB
  cap is checked — the cap bounds what is parsed, not peak memory while
  reading (streaming would fix it).
- Most calendar providers block direct browser requests (CORS); the supported
  path is the file import.
- The timeline-screen "Export" button is deferred until the W7 timeline
  rewrite lands.
- A pre-existing unnamed control on the Settings page (`INPUT.accent-accent`
  near the accent picker) fails a settings-wide a11y tripwire; the tripwire in
  this wave is scoped to the Calendar card. Not fixed here (not this wave's
  control).
- No Android device run: the Web Share path is unit-tested with a stubbed
  `navigator.canShare/share`; real WebView share-sheet behavior is unverified.
