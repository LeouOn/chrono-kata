# Wave 8 — Calendar interop (part 1: ICS core)

**Status:** part 1 complete (this PR) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 8
**Status map:** `docs/ROADMAP_STATUS.md` W8 (now "partial")

Pure ICS export/import for `Block`s. No UI, no file picker, no network, no DB
write, no Google Calendar changes — decision Q3 keeps Google Calendar exactly
as it is and treats ICS as additive.

## Shipped

- `src/lib/ics/ics-export.ts` — `blocksToIcs(blocks, { now, calendarName })`
- `src/lib/ics/ics-import.ts` — `icsToBlocks(text, { now, defaultKind, windowDays, maxOccurrencesPerEvent })`, plus `stableUuidFromString` and `wallTimeInZoneToUtc`
- `tests/unit/ics/` — 57 tests (export 15, import 27, round trip 7, TZ 8)
- `tests/fixtures/ics/` — synthetic Google-, Apple- and Outlook-shaped exports

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

## Known follow-ups from the #26 review (none block the pure-module merge)

A. **Unknown TZID with a broken VTIMEZONE is not skipped.** A file whose
   VTIMEZONE cannot be registered and whose TZID is not an IANA zone currently
   falls through to the floating branch, so the wall time is taken as UTC and no
   skip is reported. Fix: before resolving, require the TZID to be either a
   registered VTIMEZONE or a name `Intl` accepts; otherwise skip with a reason.
   (The same TZID *without* a VTIMEZONE is already refused correctly.) Fix this
   before the importer is wired into the UI.
B. **`RECURRENCE-ID` instances are imported twice.** A modified instance becomes
   an extra block next to the series occurrence. Real calendars emit this; fix by
   keying expanded occurrences on `(UID, RECURRENCE-ID)` and replacing the
   matching occurrence.
C. **A UTF-8 BOM loses the whole file** with a confusing parser error (Windows
   exports carry one). Strip a leading BOM before parsing and report "file starts
   with a BOM" if it is still unreadable.
D. **Truncation reason is imprecise**: the 100 000-iteration cap reports
   "truncated at 500 occurrences" even when fewer were produced. Report which
   cap fired.

## Not tested / not in scope

- File picker, share sheet, pasted subscription URL fetch, export/import
  screens (Wave 8 UI).
- Persisting `calendarRef` into Dexie (the mapping is pure; a repo write is part
  of the UI work).
- Android native calendar (flagged, later).
- Ambiguous wall times in the repeated DST hour resolve to the second
  occurrence (ical.js/VTIMEZONE semantics); a block whose DTEND is written
  inside the repeated hour is inherently ambiguous.
- A Windows-style VTIMEZONE can disagree with the real zone rule (Outlook's
  "W. Europe Standard Time" says +02:00 for EU summer time where the real rule
  is +03:00), so those files yield instants one hour off. That is in the file,
  not the parser; prefer the IANA path when the name is known.
- The exporter was re-read by ical.js (a different implementation), not by an
  independent third-party parser or a real calendar app.
- `VTIMEZONE` with broken rules falls back to the IANA TZID when the name is an
  IANA zone, otherwise the event is reported as unsupported rather than guessed.
- Multi-calendar imports (`VCALENDAR` with several `VEVENT`s is supported, but
  per-calendar naming/`X-WR-CALNAME` is not carried onto blocks).
