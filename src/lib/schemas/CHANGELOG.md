# Schema Changelog

## 2026-10-23 — Feature flags (roadmap Wave 0 prerequisite)

`settings.ts` gains optional `flags`: a partial record over the closed
`FlagName` union `privateMode | nativeCalendar | nudgeKinds | sync`, one
boolean each, defaulting to `{}` on new rows. The field is optional and
non-indexed, so Dexie is unchanged and a row written before flags existed
stays valid — it simply has no flags and every flag reads as off unless the
caller passes a different default. `FLAG_NAMES` is the only source of truth
for the names, so a typo fails the typecheck.

`settingsRepo.setFlag(name, value)` sets one flag without touching the others
or any other setting, and `useFlag` / `useFlags` read a flag with an explicit
default. No flagged feature is built by this change.

## 2026-10-23 — Unified data model (roadmap Wave 1)

New Zod schemas for the work vocabulary (a task is never a session):
`domain.ts` (Domain: name, color, icon, order), `project.ts` (Project:
title, domainId, status active|paused|done|dropped, cadencePerWeek,
breadcrumb, lastTouchedAt), `task.ts` (Task: nextAction, domain/project/
parent links, status inbox|next|scheduled|waiting|done|dropped with
doneAt exactly when done, estimateMin/actualMin, energy, context[],
dueAt/deferUntil, source, touchedAt), `block.ts` (Block: start/end with
end > start, kind fixed|anchor|focus, task/project links, calendarRef),
`day-plan.ts` (DayPlan: local day key YYYY-MM-DD like check-ins, picks,
capacityMin, shutdownNote, journal), `estimate.ts` (Estimate: taskId,
source 'user'|providerId, minutes, rationale).

Dexie version 7 adds tables `domains`, `projects`, `tasks`, `blocks`,
`dayPlans`, `estimates` and indexes `sessions.taskId`/`sessions.projectId`
(time invested per task/project). The v6→v7 upgrade seeds the four default
domains (Trading, Practice, Career/Build, Life admin, fixed UUIDs); fresh
installs get the same seed via `on('populate')`. Existing rows are untouched.
Habit/KataTemplate `domainId` and Session `taskId`/`projectId`/`blockId`
Zod fields land with the Wave 1 repository layer.
b4d949e (feat(settings): add the feature-flag mechanism (roadmap Wave 0 prerequisite))

## 2026-09-28 — Recovery-mode streaks (pacing T6)

`settings.ts` gains optional `recoveryMode: boolean` (default false) and
`lowEnergyRestThreshold: 1 | 2 | 3` (default 2, matching the pacing
engine's rest floor). `compute-streak.ts` accepts optional `recoveryMode`,
`checkInDays`, and `lowEnergyDays` args (local YYYY-MM-DD keys): with
recovery mode on, check-in days count like session days and low-energy
days are exempt like rest days without spending a freeze; when off, both
sets are ignored. Both settings fields are optional and non-indexed, so
Dexie is unchanged.

## 2026-09-26 — Kata intensity (pacing T3)

`kata-template.ts` gains an additive `intensity: 1 | 2 | 3` field
(1 gentle, 2 moderate, 3 hard) that scales session load in the pacing
engine. The field is optional and non-indexed, and
`DexieKataTemplateRepository.create` persists it; existing records
default to 1 at read time, so no Dexie migration is needed.

## 2026-09-25 — Habit links by kata id

`session.ts` gains optional `kataTemplateId`. `habit.ts` gains optional
`linkedKataTemplateId`. `settings.ts` gains optional `habitLinksMigrated`.
Dexie version 6 indexes `sessions.kataTemplateId` and backfills both id
fields from normalized template names. Unmatched labels are left alone.

## 2026-09-25 — Morning check-in toggle

`settings.ts` accepts optional `showMorningCheckIn` (default true). Existing
rows stay valid, and Dexie is unchanged.

## 2026-09-25 — Session soft cap

`kata-template.ts` gains optional `softCapMinutes` (1–600). `session.ts` gains
optional `stoppedAtCap`. Neither field is indexed, so Dexie stays on its
current version.

## 2026-09-25 — Morning check-ins (pacing T1)

New `check-in.ts`: `CheckInSchema`, one row per local day keyed by `date`
(YYYY-MM-DD), with 1–5 scores for `energy` and `sleep` (high is good) and
`fog` and `aches` (high is bad), plus an optional note (≤ 500 chars).
Additive: new Dexie table `checkIns: 'date'` in DB version 5. Existing tables
and records are untouched, so no data migration is needed.

Backup envelope bumped to `version: 2`, which adds an optional `checkIns`
array. `migrateEnvelope()` upgrades v1 files on import. A v1 file (or a v2
file without `checkIns`) leaves local check-ins untouched.

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
