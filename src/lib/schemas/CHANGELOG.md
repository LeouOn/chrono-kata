# Schema Changelog

## 2026-10-24 — The time a project's note last changed (roadmap W10 part 2)

`project.ts` gains optional, non-indexed `breadcrumbAt` (a date, nullable): when the
project's `breadcrumb` last CHANGED. `updatedAt` moves on every write to the row
(pausing a project in the weekly review, a cadence edit, any session), so it cannot
tell whether the project's own note or a later session's note is the newer one; the
project page showed a stale note after any unrelated edit. `breadcrumbAt` can.

It is stamped by the project repository and by nothing else: on `create` with a
note, and on `update` only when the note's TEXT changes (compared trimmed, blank
being no note). A write that re-sends the same note, `touch()`, and anything a
caller passes for `breadcrumbAt` leave it alone. It is not part of the typed input.
A row from before this field has no stamp; readers fall back to `updatedAt` for it
until its note is next written. Dexie stays on v7 (not indexed); the backup importer
revives the date, and a backup without it still imports. See docs/waves/wave-10.md.

## 2026-10-24 — Review intentions for the week ahead (roadmap W11, wizard)

`review.ts`: `Review` gains optional `nextWeekIntentions`, a record of minutes
per domain id for the week AFTER the reviewed one. The wizard's last step
("shape next week") writes it, and the next week's review reads it as the aim
its domain balance is measured against — the roadmap has no other home for a
forward-looking intention, and putting it on the reviewed week's review needs no
extra table. Optional and non-indexed, so Dexie stays on **v8** and rows written
before this change remain valid. The value is produced by
`IntentionsSchema` in `src/lib/review/decisions.ts`, which also bounds it to a
real week of minutes (0–10,080), so the input and the stored value share one
limit.

## 2026-10-24 — Weekly review and resumable draft (roadmap W11, data core)

New `review.ts`: `Review` (keyed by the local Monday `weekOf`, `notes` up to
10,000 characters, an optional deterministic `statsSnapshot`) and `ReviewDraft`
(`weekOf`, a zero-based `step` in 0–5, the decisions made so far). Dexie moves to
**v8** with two new keyed tables, `reviews` (`weekOf`) and `reviewDrafts`
(`weekOf, updatedAt`); new tables need no data upgrade, so rows written before
v8 open unchanged. `weekOf` is validated as a real Monday day key rather than
merely as `YYYY-MM-DD`, so a review cannot be filed under a day.

`statsSnapshot` is `WeeklyStatsSchema` from `src/lib/review/stats.ts` — the same
schema the pure summer produces and validates, so the stored shape and the
computed shape cannot drift apart. `reviewRepo` adds a transactional `upsert`, an
atomic `complete` (writes the review and clears its draft in one transaction),
`getDraft`/`latestDraft` returning `null` rather than `undefined`, and
`latestDraft` ordered by the new `updatedAt` index so a draft started last week
is still found after the week key has changed. The v2 backup envelope carries
`reviews` and `reviewDrafts` as optional fields; an absent key means "preserve
local rows", and the envelope version stays 2.

The importer treats the snapshot as derived data: a review row that fails
validation only because of `statsSnapshot` (a snapshot written by an older build,
whose schema keeps growing) is restored **without** the snapshot and counted
separately (`snapshotsDropped`), so the user's notes are never lost. A review
that is invalid for its own reasons (a non-Monday key, notes over 10,000, bad
dates) is still skipped. `reviewRepo` applies the same rule on the write path,
and `saveDraft` refuses a decisions payload above 64 KB with a calm error.

## 2026-10-24 — Remembered .ics subscription address (roadmap W8 part 2)

`settings.ts` gains optional `icsSubscriptionUrl` (https URL, <= 500 chars,
nullable): the remembered calendar subscription address for the ICS import,
stored only when the user explicitly opts in ("Remember this address", off by
default). Optional and non-indexed, so Dexie stays on v7 and the backup
envelope stays version 2 (optional field only).

## 2026-10-24 — Project rhythm: block length and stall setting (roadmap W10 part 1)

`project.ts` gains two optional, non-indexed fields, so Dexie stays on v7 and
rows written before this wave remain valid (both accept `null` as "cleared"):

- `cadenceBlockMin` — integer 5–240, the target length of one block ("2 blocks
  a week, 45 min"). With it, cadence counts a session by its minutes (one
  session never earns more than one block); without it, each session is one
  block as before. Inert without `cadencePerWeek`.
- `stallAfterDays` — integer 3–365, local days without work before the project
  is offered a gentle revive. Absent means "derive it from the project's own
  rhythm" (twice its usual gap, never under 7).

Both are carried by the backup envelope (still `version: 2`) because import
validates projects with `ProjectSchema`. See docs/waves/wave-10.md.

## 2026-10-23 — Planning settings: waking hours and anchors (roadmap W6 part 1)

`settings.ts` gains optional `wakingHours` (`{ start, end }`, `HH:MM` 24-hour,
default 07:00–22:00) and `anchors` (an optional array of recurring protected
windows: `{ id, title, weekdays, start, end, domainId? }`, where `end` at or
before `start` means the anchor crosses midnight). Both are optional and
non-indexed, so Dexie stays on v7 and rows written before planning existed
remain valid. They are **settings, not a table**: they are per-device
configuration read on every capacity computation, never queried by index, and
this avoids a Dexie version for data with at most a handful of rows.


## 2026-10-23 — Session outcome and breadcrumb (roadmap W9 part 1)

`session.ts` gains optional `outcome` (`'done' | 'progress' | 'blocked'`,
`SessionOutcomeSchema`) and `breadcrumb` (string, max 500, "pick up here next
time"). Both are optional and non-indexed, so Dexie stays on version 7 and rows
written before this change remain valid. The v2 backup envelope carries them
as ordinary optional session fields — no envelope version bump.


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

## 2026-10-23 — Wave 1 repositories, links, backup fields (roadmap W1, part 2)

`session.ts` gains optional `taskId`/`projectId`/`blockId` (taskId/projectId
indexed in Dexie v7; blockId non-indexed). `habit.ts` and
`kata-template.ts` gain an optional non-indexed `domainId`. The backup
envelope (still `version: 2`) carries `domains`/`projects`/`tasks`/`blocks`/
`dayPlans`/`estimates` as optional fields per the T1 rule; imports skip and
count invalid rows and leave the new tables untouched when the keys are
absent. New repositories (`src/lib/db/*.repo.ts`) and pure task-status
transitions (`src/lib/tasks/transitions.ts`). See docs/waves/wave-01.md.

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
