# Schema Changelog

## 2026-09-25 — Session soft cap

`kata-template.ts` gains optional `softCapMinutes` (1–600). `session.ts` gains
optional `stoppedAtCap`. Neither field is indexed, so Dexie stays on its
current version.

## 2026-09-21 — Star ratings

`settings.ts` accepts `ratingStyle: 'stars'`. New settings default to stars.
Emoji, slider, and dots remain valid. Existing rows are unchanged, so no
Dexie migration is required.

## 2026-09-21 — Habits (definitions + dated logs)

New `habit.ts`: `HabitSchema` (kind: timed|boolean|count, per-day target,
daily/weekday schedule, optional linked activity label, archive timestamp)
and `HabitLogSchema` (dated entries; manual or session-sourced). Additive:
two new Dexie tables in DB version 4 (`habits`, `habitLogs`); existing
tables and records are untouched, so no data migration is needed.

## 2026-09-21 — Local desktop AI connections

Provider entries optionally identify `credentialSource` (`browser` or
`environment`). Environment entries contain an empty key; server keys are never
stored in IndexedDB. Empty keys and active provider names are accepted for
redacted backups and unconfigured settings. An optional
`dismissedEnvironmentProviders` list preserves removal choices. Existing rows
remain valid; no IndexedDB layout changes are required.

Tracks breaking and additive changes to Zod schemas in this directory.
Additive changes (new optional fields) only require a Zod edit.
Breaking changes (field renames, type changes, removals) require BOTH a
Zod schema version bump AND a Dexie migration step.

## 2026-09-21 — Streak freeze consumption persisted

`streak.ts` gains an additive `freezeUsedOn: string[]` field (local YYYY-MM-DD
dates already covered by a spent streak-freeze token). Tokens now deplete
across recomputes; dates that no longer protect a live streak are pruned,
refunding their tokens. Existing records lack the field and default to `[]`;
no Dexie migration is needed (non-indexed field).

## 2026-09-21 — Stretch routine durations

`session.ts` now accepts positive fractional minutes, preserving exact 30-second
holds. Existing integer durations remain valid; the stored number type and
IndexedDB layout are unchanged, so no data migration is needed.

## 2026-07-21 — Initial schemas (Wave 1)

Established baseline schemas:
- `session.ts` — Session entity (mutual-exclusion rule on durationMinutes XOR reps)
- `reflection.ts` — Weekly AI reflection
- `streak.ts` — Cached streak singleton (id='singleton')
- `settings.ts` — App settings singleton; displayName max 50 chars
- `llm-settings.ts` — LLM provider configs + monthly token counter
- `pending-calendar-op.ts` — Queued calendar ops for retry
- `token.ts` — Google OAuth tokens (id='google')
- `coach-personality.ts` — Coach personality enum (zen|hype|analyst|buddy|athena)

Dexie DB version 1.
