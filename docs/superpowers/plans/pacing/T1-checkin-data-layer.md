# T1: Check-in data layer, backup v2, migration harness

**Depends on:** nothing. **Blocks:** T2, T3, T6, T8, T9. Keep this small and land it fast.

## Why
A session's rating measures how it felt in the moment. After Lyme, the real signal is how you feel the *next morning*. The daily check-in is the base the pacing work builds on.

## Scope

1. **Schema** in `src/lib/schemas/check-in.ts`, re-exported from `schemas/index.ts`:
   ```ts
   CheckIn = {
     date: string        // YYYY-MM-DD local, primary key (one per day)
     energy: 1|2|3|4|5   // 1 = depleted
     fog: 1|2|3|4|5      // 1 = clear, 5 = heavy  (document direction clearly)
     aches: 1|2|3|4|5    // 1 = none
     sleep: 1|2|3|4|5    // 1 = poor
     note?: string (max 500)
     createdAt: Date; updatedAt: Date
   }
   ```
   Choose the direction of each scale and document it in the schema. Recommendation: energy and sleep are high-is-good, and fog and aches are high-is-bad, matching how people naturally answer. T3 normalizes them.
2. **Dexie v5** in `src/lib/db/db.ts`: copy the v4 stores and add `checkIns: 'date'`. Add the `checkIns` table typing.
3. **Repo** in `src/lib/db/check-in.repo.ts`: `getByDate(date)`, `upsert(input)` (preserves `createdAt`), `range(from, to)` (inclusive, sorted ascending), `delete(date)`, `getAll()`.
4. **Backup envelope v2** in `src/lib/data-transfer/`:
   - Change `ExportEnvelope.version` to `1 | 2`. Export writes `2` and includes `checkIns`.
   - Add `migrateEnvelope(raw): ExportEnvelopeV2`. v1 → v2 adds `checkIns: undefined`, so the existing "absent means preserve local" semantics still hold.
   - Import validates the checkIns with Zod and restores them.
   - Include `checkIns` in clear-all-data (`ClearDataSettings`) if it enumerates tables.
5. **Migration test harness** at `tests/unit/db/migrations.test.ts`:
   - A helper that creates a DB at an old version with raw `new Dexie('chrono-kata').version(4).stores({...})`, seeds fixture rows, closes it, then opens `ChronoKataDB` and asserts the rows survive and the new tables exist.
   - Add the first case: v4 → v5. T8 will add v5 → v6.
6. Add a CHANGELOG entry.

## Acceptance
- Repo unit tests: upsert is idempotent per date, and `range` includes both ends.
- Import tests: a v1 file imports cleanly, and a v2 round-trip preserves check-ins.
- The migration test passes.
- `npm run precommit` is green.

## Out of scope
Any UI (T2) and any analysis (T3).
