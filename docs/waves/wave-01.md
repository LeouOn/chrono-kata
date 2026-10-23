# Wave 1 — Unified data model (tasks, projects, domains)

**Shipped:** 2026-10-23 · **PRs:** #14 (migration, reviewed by check-g before merge),
#17 (repositories, links, backup, docs) · **Lane:** A (data)

## What shipped

- Six Zod schemas + Dexie v7 tables: `Domain`, `Project`, `Task`, `Block`, `DayPlan`,
  `Estimate`, plus `sessions.taskId`/`projectId` indexes (time invested per task/project).
- Default domains (Trading, Practice, Career/Build, Life admin) with fixed UUIDs, seeded on
  both the fresh-install (`on('populate')`) and v6→v7 upgrade paths, plus an idempotent
  `ensureDefaultDomains()` heal called from the main layout (check-g's review residual:
  a silently failed populate seed would otherwise never retry).
- Typed repositories for every entity: by status / domain / project, stale-since
  (`touchedAt`, `lastTouchedAt`), task children (`parentId`), block overlap-range.
- Pure task-status transitions (`src/lib/tasks/transitions.ts`): inbox/next/scheduled/
  waiting/done/dropped; `done`/`dropped` are terminal but reopenable; `doneAt` is set
  exactly when status is `done`; every transition bumps `touchedAt`.
- Links: `Session.taskId/projectId/blockId` (optional); `Habit.domainId`,
  `KataTemplate.domainId` (optional, non-indexed — no extra Dexie version).
- Backup envelope: the six tables ride as optional fields; envelope version stays `2`
  per the T1 ground rule ("later tasks add new tables only as optional fields").
  Legacy files without the keys leave the new tables untouched; invalid rows are
  skipped and counted.

## Entity-shape decisions (and why)

The roadmap's shapes were adapted to existing conventions:

- Every entity carries `createdAt`/`updatedAt` (repo upsert convention — e.g. DayPlan
  upsert preserves the original `createdAt`). `Estimate` keeps the roadmap's `createdAt`
  and gains `updatedAt` for the same reason.
- `Estimate.source` is an open string (`'user' | providerId`), not an enum — provider ids
  are user-defined (decision Q5).
- `Task.actualMin` allows fractional minutes (30-second precision, like session durations);
  `estimateMin` stays whole minutes.
- `TaskInput` defaults `status: 'inbox'`, `source: 'manual'` at the repository layer
  (the Habit repo pattern), so Wave 2 capture can pass just a title.
- `DayPlan.picks` is uncapped in the schema; the roadmap's "1–3 picks" is a planning rule
  Wave 6 owns, not a data constraint.
- `Task.dueAt`/`deferUntil`/`doneAt` are instants (Date), not day keys; only `DayPlan.date`
  is a local day key.

## Tests

- `tests/unit/db/migrations.test.ts`: v6→v7 upgrade over `generateDemoData()` fixtures
  (row-for-row survival, compound indexes, backfilled links) + fresh-install populate seed.
  Independently deep-diffed and mutation-tested at review.
- `tests/unit/db/w1-crud.test.ts`: CRUD + every typed query for all six entities,
  link round-trip on sessions, transition rules, and the empty-domains heal.
- `tests/unit/data-transfer/w1-round-trip.test.ts`: export → JSON → parse → replaceAll
  round-trip for all six tables + linked session; legacy-envelope no-op; invalid-row skips.

## Deferred / known issues

- No UI, no LLM, no settings changes in W1 (per the wave's scope; W2+ build on the repos).
- Linking existing habits/kata templates to the seeded Practice domain is left manual
  (optional field, no automatic backfill — avoiding a guess the user didn't make).
- `docs/ROADMAP_STATUS.md` W1 section updated in PR #17; d1's #16 adds the v6 fixture
  test alongside the v7 rows in `migrations.test.ts` (kept both per d1's note).
