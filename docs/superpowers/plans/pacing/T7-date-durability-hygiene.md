# T7: UTC date fixes, time zone/DST tests, storage.persist

**Depends on:** nothing. Small, and a good warm-up task.

## Why
The user moves between Finland and California. One UTC day key splits an evening session onto the wrong day. The browser may also evict IndexedDB unless storage is marked persistent.

## Scope
1. **Fix the known UTC day keys.** `src/hooks/useSessions.ts:138` and `:143` use `startedAt.toISOString().slice(0, 10)` in coach context. Replace them with `toLocalDateString`.
2. **Sweep:** `grep -rn "toISOString()" src` and fix any other place used as a *day key*. Leave ISO timestamps for storage and filenames alone, but consider making the backup filename in `data-transfer/export.ts` use the local date.
3. **Time zone and DST tests** (`tests/unit/utils/date-tz.test.ts`, `tests/unit/streak/compute-streak-tz.test.ts`):
   - Run blocks under `TZ=Europe/Helsinki` and `TZ=America/Los_Angeles`. Either add a vitest config/project for each TZ, or set `process.env.TZ` before the date modules load. Document whichever works.
   - Cases: a session at 23:30 local is keyed to the local date. Streaks survive both DST transitions (spring forward and fall back) in each zone. A Helsinki → LA move keeps the streak: sessions logged on consecutive local days across the move.
   - Make sure that stepping one day in `compute-streak` isn't done by adding 86 400 000 ms. If it is, fix it to use calendar arithmetic.
4. **Persistent storage (web only):** in `PlatformRuntime.tsx`, on non-native platforms, call `navigator.storage?.persist?.()` once. Show the status ("Storage: persistent / may be cleared by browser") in settings near `DataTransfer.tsx`, using `navigator.storage.persisted()`.

## Acceptance
- The new TZ tests pass in both zones, and they fail on the old code for at least one case. Confirm by temporarily reverting.
- No `toISOString().slice(0, 10)` day keys remain in `src/`.
- `npm run precommit` is green.
