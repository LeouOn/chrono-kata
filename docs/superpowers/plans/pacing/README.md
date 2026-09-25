# Pacing roadmap: task board

Goal: make Chrono Kata serve post-Lyme recovery pacing. That means capturing how you feel the next day, deciding load deterministically, having the coach phrase the decision rather than make it, and keeping the data durable on Android.

Each `T*.md` file here is one self-contained task for one agent. Pick any task whose dependencies are **merged to `main`**.

## How to claim a task

1. `git pull`, then open this README and check the board below.
2. Change the task's status to `claimed (<your-branch>, YYYY-MM-DD)`. Commit only that line, with the message `chore(plan): claim T<n>`, and push to `main`. If the push conflicts, someone else claimed a task at the same moment. Pull and re-check.
3. Work on branch `pacing/t<n>-<slug>`.
4. When merged, set the status to `done (<merge sha>)`.

## Board

| Task | Title | Depends on | Status |
|---|---|---|---|
| [T1](T1-checkin-data-layer.md) | Check-in data layer + backup v2 + migration harness | none | done (c1bd779) |
| [T2](T2-checkin-ui.md) | Morning check-in UI | T1 | open |
| [T3](T3-pacing-engine.md) | Pacing engine (load, lagged response, recommend) | T1 | open |
| [T4](T4-session-durability-soft-cap.md) | Session timer durability + soft cap + notifications | none | claimed (pacing/t4-session-durability-soft-cap, 2026-09-25) |
| [T5](T5-rules-first-coach.md) | Rules-first coach with validated output | T2, T3 | open |
| [T6](T6-recovery-mode-streaks.md) | Recovery-mode streaks | T1, T3 | open |
| [T7](T7-date-durability-hygiene.md) | UTC date fixes, TZ/DST tests, storage.persist | none | open |
| [T8](T8-habit-link-by-id.md) | Link habits to kata by ID (Dexie v6) | T1, T4 | open |
| [T9](T9-android-hardening.md) | Android: Keystore keys, native HTTP, auto-backup, export E2E | T1 | open |
| [T10](T10-load-response-insights.md) | Load-response insights view + case study | T3, T4, and ~3–4 weeks of check-in data | open |

```
T1 ─┬─ T2 ─┐
    ├─ T3 ─┼─ T5
    │      ├─ T6
    │      └─ T10 (after data accumulates)
    ├─ T9
    └─ T8 ← also after T4
T4, T7: start any time
```

## Ground rules (all tasks)

- **Reserved Dexie versions.** v5 belongs to T1 (`checkIns` table) and v6 to T8 (session `kataTemplateId` index). No other task adds a Dexie version. Adding an **optional, non-indexed** field to an existing schema needs no version bump.
- **Backup envelope** (`src/lib/data-transfer/types.ts`) is owned by T1, which bumps it to `version: 2` with `migrateEnvelope()`. Later tasks add new tables only as optional fields.
- Record every schema change in `src/lib/schemas/CHANGELOG.md`.
- **Dates:** use local `YYYY-MM-DD` via `toLocalDateString` (`src/lib/utils/date.ts`). Never use `toISOString().slice(0,10)` for a day key.
- **Tests:** Vitest for all pure logic, with `fake-indexeddb` for DB code. For date logic, use `vi.useFakeTimers()` and run under `TZ=Europe/Helsinki` / `TZ=America/Los_Angeles`.
- `npm run precommit` (typecheck + lint + test) must pass. If typecheck fails with missing `@capacitor/*` modules, run `npm install` first.
- Match the existing code style: repos in `src/lib/db/*.repo.ts`, Zod schemas in `src/lib/schemas/`, React Query hooks in `src/hooks/`.
- Health data is sensitive. Nothing new leaves the device except through the coach path in T5, which sends aggregates only.

## Already done (don't redo)

- The service worker is skipped/unregistered on native (`src/components/system/PlatformRuntime.tsx`).
- Session and habit timers compute elapsed time from a start timestamp.
- Streaks and habit logs use local date keys.
- The daily briefing is cached per date and personality.
- Export blanks API keys.
- `useSearchParams` is Suspense-wrapped.
