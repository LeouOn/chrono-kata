# Data model — current state

Audited 2026-10-23 against `main` (Dexie **version 7**); Wave 11 adds
**version 8**. Source of truth:
`src/lib/db/db.ts` (store definitions + upgrades), `src/lib/schemas/*` (row
shapes), `src/lib/db/*.repo.ts` (access), `src/lib/data-transfer/*` (backup).

Everything lives in one IndexedDB database, `chrono-kata`, opened through the
singleton `getDb()` in `src/lib/db/db.ts`. There is no server-side store.

**The next free Dexie version is 9.** v5 added `checkIns`, v6 added the
`sessions.kataTemplateId` index, v7 added the Wave 1 planning tables, and v8
added the Wave 11 review tables.

## 1. Tables and indexes by version

| Ver | Added / changed | Store definitions introduced |
|---|---|---|
| 1 | baseline | `sessions: 'id, startedAt, calendarEventId'`, `reflections: 'id, periodStart, periodEnd'`, `streak: 'id'`, `settings: 'id'`, `llmSettings: 'id'`, `pendingCalendarOps: 'id, sessionId'`, `tokens: 'id'` |
| 2 | coach conversations | `sessions` gains `conversationId` index; new `conversations: 'id, sessionId'`, `messages: 'id, conversationId, parentId'` |
| 3 | kata templates | new `kataTemplates: 'id, name, order, createdAt'` |
| 4 | habits | new `habits: 'id, order'`, `habitLogs: 'id, habitId, date, sessionId, [habitId+date]'` |
| 5 | morning check-ins | new `checkIns: 'date'` (primary key is the local `YYYY-MM-DD`) |
| 6 | kata id links | `sessions` gains `kataTemplateId` index; upgrade backfills `sessions.kataTemplateId` and `habits.linkedKataTemplateId` from normalized template names |
| 7 | Wave 1 planning entities | `sessions` gains `taskId`/`projectId` indexes; new `domains: 'id, order'`, `projects: 'id, domainId, status, lastTouchedAt'`, `tasks: 'id, status, domainId, projectId, parentId, touchedAt'`, `blocks: 'id, start, kind, taskId, projectId'`, `dayPlans: 'date'`, `estimates: 'id, taskId, createdAt'`; upgrade and `populate` seed the four default domains |
| 8 | Wave 11 weekly reviews | new `reviews: 'weekOf'` and `reviewDrafts: 'weekOf, updatedAt'` (both keyed by the local Monday day key); new tables only, no data upgrade |

Current (v8) full store map:

```
sessions             id, startedAt, calendarEventId, conversationId, kataTemplateId,
                     taskId, projectId             (taskId/projectId from v7)
reflections          id, periodStart, periodEnd
streak               id
settings             id
llmSettings          id
pendingCalendarOps   id, sessionId
tokens               id
conversations        id, sessionId
messages             id, conversationId, parentId
kataTemplates        id, name, order, createdAt
habits               id, order
habitLogs            id, habitId, date, sessionId, [habitId+date]
checkIns             date
domains              id, order                          (v7)
projects             id, domainId, status, lastTouchedAt (v7)
tasks                id, status, domainId, projectId, parentId, touchedAt (v7)
blocks               id, start, kind, taskId, projectId  (v7)
dayPlans             date                               (v7)
estimates            id, taskId, createdAt              (v7)
reviews              weekOf                              (v8)
reviewDrafts         weekOf, updatedAt                   (v8)
```

Singletons: `streak`, `settings`, `llmSettings` (primary key `'singleton'`),
`tokens` (primary key `'google'`).

Migrating: `ChronoKataDB` declares one `version(n).stores(...)` per step and any
`.upgrade()` runs inside that step. Dexie applies every version up to the
highest declared one when an older database is opened. Tests:
`tests/unit/db/migrations.test.ts` (frozen historical store snapshots, seeded
with fixtures, then opened at the current version) and
`tests/unit/db/db-upgrade.test.ts`.

## 2. Rows (Zod schemas in `src/lib/schemas/`)

Schemas are the boundary: repos validate on write, import validates on read.
`index.ts` re-exports the entity schemas (`habit`, `kata-template`, `streak`,
`settings`, `llm-settings`, `session`, `conversation`, `message`, `check-in`,
`reflection`, `pending-calendar-op`, `token`, `coach-personality`).

- **session** (`session.ts`): `id` uuid, `startedAt`, `endedAt?`,
  `durationMinutes?`, `reps?`, `rating` 1–5, `activityLabel?`, `note?`,
  `coachComment?`, `coachPersonalityAtGeneration?`, `failedLLM?`,
  `calendarEventId?`, `focusRating?`/`energyRating?`/`moodRating?` (1–5),
  `conversationId?`, `stoppedAtCap?`, `kataTemplateId?`, `createdAt`,
  `updatedAt`. Refinement: **exactly one** of `durationMinutes` or `reps`.
  Durations may be fractional (30-second holds).
- **checkIn** (`check-in.ts`): `date` (`YYYY-MM-DD`, primary key), `energy`,
  `fog`, `aches`, `sleep` (all 1–5; high fog/aches are bad), `note?` (≤ 500),
  `createdAt`, `updatedAt`. One row per local day; `upsert` replaces it.
- **habit** (`habit.ts`): `id`, `name`, `icon`, `kind`
  (`timed|boolean|count`), `unit?` (required for count), `targetPerDay?` (null
  for boolean), `schedule` (`daily` or `weekdays` + days), `linkedActivityLabel?`,
  `linkedKataTemplateId?`, `order`, `archivedAt?`, timestamps.
- **habitLog** (`habit.ts`): `id`, `habitId`, `date`, `minutes?` (timed),
  `delta?` (count), `note?`, `source` (`manual|session`), `sessionId?`
  (required when source is `session`), `createdAt`.
- **kataTemplate** (`kata-template.ts`): `id`, `name`, `mode`
  (`timed|reps`), `defaultDurationMinutes?`, `defaultReps?`, `softCapMinutes?`,
  `activityLabel?`, `intensity?` (1–3), `defaultNote?`, `icon`, `order`,
  timestamps. `DEFAULT_KATA_TEMPLATES` seeds three templates.
- **conversation** (`conversation.ts`): `id`, `sessionId`,
  `rootMessageId?`, `activeLeafId?`, timestamps.
- **message** (`message.ts`): `id`, `conversationId`, `parentId?` (tree),
  `role` (`user|assistant`), `content`, optional `provider`, `model`,
  `personality`, `tokensUsed {prompt, completion}`, `latencyMs`,
  `systemPrompt`, `rawPrompt`, `isEdited`, `editedAt`.
- **streak** (`streak.ts`): `id: 'singleton'`, `currentStreakDays`,
  `longestStreakDays`, `lastSessionDate` (`YYYY-MM-DD`), `milestonesAchieved`,
  `freezeUsedOn` (local day keys already covered by a spent freeze; defaults
  to `[]`), `updatedAt`. Derived cache — see `recomputeStreakSideEffect()`.
- **settings** (`settings.ts`): `id: 'singleton'` plus optional UI/behaviour
  fields (coach selection and unlocked personalities, calendar id/sync,
  reminder time, notifications, theme/accent/rating style, confirmation flags,
  goals, rest days, freeze tokens, recovery mode and low-energy threshold) and
  timestamps. Missing optionals fall back to `DEFAULT_SETTINGS` readers.
  It also carries `flags`: an optional, non-indexed object holding any subset
  of the closed flag set `FLAG_NAMES` (`privateMode`, `nativeCalendar`,
  `nudgeKinds`, `sync`). Flags are read/written only via
  `src/lib/settings/flags.ts` (`flagValue`, `withFlag`, `isFlagName`), so an
  unset or missing flag reads as off. Adding a flag name needs no Dexie
  version.
- **llmSettings** (`llm-settings.ts`): `id: 'singleton'`,
  `activeProviderName`, `providers` (record of `{baseUrl, model, apiKey,
  credentialSource?}`), `dismissedEnvironmentProviders?`,
  `totalTokensThisMonth`, `totalTokensResetAt`, `updatedAt`.
- **reflection** (`reflection.ts`): `id`, `periodStart`, `periodEnd`,
  `observations` (1–5 strings), `question`, `sourceSessionIds`, `createdAt`.
- **review** (`review.ts`): `weekOf` (primary key — the local Monday day key of
  the reviewed week), `notes` (≤ 10,000), an optional `statsSnapshot` (the
  `WeeklyStatsSchema` object from `src/lib/review/stats.ts`), an optional
  `nextWeekIntentions` (minutes per domain for the following week, written by
  the wizard's last step and read by the next review), `createdAt`, `updatedAt`.
  One review per week; existence means the review was completed. Additive and
  non-indexed, so it needs no Dexie version.
- **reviewDraft** (`review.ts`): `weekOf` (primary key), `step` (0–5, the
  zero-based wizard step), `decisions` (open record owned by the wizard: what
  the user chose in each step so far), `updatedAt`. Indexed by `updatedAt` so
  the wizard can resume the most recent draft after the week key moves on.
- **pendingCalendarOp** (`pending-calendar-op.ts`): queued calendar create /
  update / delete with `attempts`, retried by `calendar/sync.ts`.
- **token** (`token.ts`): Google OAuth tokens stored under `'google'`.

## 3. Repositories (`src/lib/db/*.repo.ts`)

One module per table, each exporting a typed interface plus a
`Dexie<Entity>Repository` class and a shared singleton instance
(`sessionRepo`, `settingsRepo`, ...). Pattern: validate with Zod on write,
return plain rows. Notable methods:

- `sessionRepo`: `getAll`, `getByPeriod(start, end)`, `getById` (lazily
  materializes a conversation for pre-Wave-11 sessions that have a
  `coachComment`), `watch()`, `save`, `update`, `delete`.
- `checkInRepo`: `getAll`, `getByDate`, `upsert`, `range(from, to)`, `delete`.
- `habitRepo`: CRUD + `reorder`; `habitLogRepo`: date/habit queries,
  `upsertForSession`, manual-count decrement helpers, delete-by-habit/session.
- `kataTemplateRepo`: CRUD + `reorder` + `seedDefaultsIfEmpty`.
- `conversationRepo` / `messageRepo`: conversation lookup by session; message
  tree operations (`getRootMessages`, `getChildren`, `getSiblings`,
  `getPathToLeaf`, `getDeepestDescendant`, `deleteSubtree`).
- `reviewRepo`: `getByWeek`/`getDraft`/`latestDraft` (all `null` when absent),
  `upsert`, `complete` (review + draft cleared in one transaction), `delete`,
  `saveDraft`, `deleteDraft`. Every week key is validated as a local Monday.
- `streakRepo`, `settingsRepo` (with `patch`), `llmSettingsRepo`
  (`addProvider`, `removeProvider`, `setActive`, `incrementTokenUsage`),
  `reflectionRepo` (with `watch`), `pendingCalendarOpsRepo`, `tokenRepo`.

React Query hooks in `src/hooks/` wrap these; nothing outside `src/lib/db/`
talks to Dexie tables directly except `data-transfer` and a few read-only
pages that need several tables at once.

## 4. Backup envelope (`src/lib/data-transfer/`)

- `types.ts`: `CURRENT_ENVELOPE_VERSION = 2`. `ExportEnvelope` has
  `version: 1 | 2`, `exportedAt`, `sessions`, `reflections`, `streak`,
  `settings`, `llmSettings`, and optional `kataTemplates`, `conversations`,
  `messages`, `habits`, `habitLogs`, `checkIns`, `domains`, `projects`, `tasks`,
  `blocks`, `dayPlans`, `estimates`, `reviews`, `reviewDrafts`. **An absent optional array
  means "preserve local data on import"**, which is how legacy files stay safe.
- `migrate.ts`: `migrateEnvelope(raw)` upgrades one version at a time
  (v1 → v2 adds `checkIns: undefined`), rejecting unknown versions. Row
  validation happens afterwards.
- `export.ts`: `collectAll()` reads every table and **blanks provider API
  keys** (environment-sourced providers are dropped from the export);
  `downloadExport()` writes `chrono-kata-backup-YYYY-MM-DD.json`.
- `import.ts`: `parseEnvelope(json)` revives ISO date strings, validates every
  row against its Zod schema, dedupes by id (check-ins and day plans by `date`,
  reviews and drafts by `weekOf`), and reports `skipped` plus
  `snapshotsDropped` (a review whose derived `statsSnapshot` no longer matches
  the current schema keeps its notes and loses only the snapshot); `replaceAll(envelope)` wipes and restores inside one Dexie
  transaction, preserving locally stored API keys when the file has empty ones,
  and leaves tables untouched when the file omits them.
- Backup UI: `src/components/settings/DataTransfer.tsx`.

Related persisted-but-not-Dexie state: the running session timer and the habit
timer live in `localStorage` (`src/lib/timers/*.ts`); theme/accent and the
`onboarding-completed` flag also live in `localStorage`.

## 5. Schema change conventions (`src/lib/schemas/CHANGELOG.md`)

- Newest entry at the top, dated `YYYY-MM-DD`, one heading per change with a
  short rationale.
- **Additive** changes (new optional fields, non-indexed) need only the Zod
  edit and a CHANGELOG entry — no Dexie version bump. Existing rows stay valid
  because readers supply defaults.
- **Breaking** changes (rename, type change, removal, new required field) need
  a Zod change **and** a Dexie `version(n).stores(...).upgrade(...)` step, a
  migration test that opens the previous version's fixture data, and a
  CHANGELOG entry saying so.
- Reserved numbering: v5 = `checkIns`, v6 = `sessions.kataTemplateId`, v7 =
  Wave 1 planning tables, v8 = Wave 11 `reviews`/`reviewDrafts`. Later work must
  not reuse those numbers; the next free version is **v9**.
- Day keys are always local `YYYY-MM-DD` via `toLocalDateString`
  (`src/lib/utils/date.ts`), never `toISOString().slice(0, 10)`. A week key is
  the local Monday of that week (`weekKeyFor`/`WeekKeySchema` in
  `src/lib/review/week.ts`); a week's boundaries are its two local midnights,
  so DST weeks are 167 or 169 hours long.

## 6. Synthetic fixtures (Wave 0)

Created for future migration tests, no personal data:

- `tests/fixtures/backup-envelope-v2.json` — a complete backup envelope
  (`version: 2`) covering every table, valid for `parseEnvelope()` /
  `replaceAll()`.
- `tests/fixtures/dexie-v6.ts` — a typed module of raw rows for every v6 table
  (Date objects, not strings), shaped for `seedLegacyDb`-style seeding.

Both are exercised by `tests/unit/data-transfer/fixtures.test.ts` and
`tests/unit/db/migrations.test.ts`; if a schema change breaks them, the change
is not additive and needs a migration.
