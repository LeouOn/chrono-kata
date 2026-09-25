# T8: Link habits to kata by ID (Dexie v6)

**Depends on:** T1 (migration harness, Dexie v5), T4 (also edits `SessionForm.tsx`). Start after both are merged.

## Why
Habits link to sessions by `linkedActivityLabel` string (`src/lib/habits/session-sync.ts`, `labelMatches`). "Walk", "walk " and "Walking" become different habits, and renaming a kata breaks the history. Sessions don't record which template they came from.

## Scope
1. **Schema**
   - `Session.kataTemplateId?: string | null` (uuid).
   - `Habit.linkedKataTemplateId?: string | null`. Keep `linkedActivityLabel` as a fallback for free-text sessions.
2. **Dexie v6** (reserved for this task): copy v5 and add `kataTemplateId` to the `sessions` index list. Add an `.upgrade(tx => ...)` that:
   - builds normalized template name → id (trim, lowercase, collapse whitespace)
   - sets `session.kataTemplateId` wherever `activityLabel` matches a template name
   - sets `habit.linkedKataTemplateId` wherever `linkedActivityLabel` matches a template name
   - leaves unmatched rows untouched
3. **Write paths:** set `kataTemplateId` when a session is started from a template (quick start, `StretchRoutine`, template picker in `SessionForm`). Renaming a template must not change the link.
4. **Matching:** `session-sync.ts` matches by `linkedKataTemplateId === session.kataTemplateId` first, then falls back to the label. After the migration, call `rebuildSessionHabitLogs()` once, for example behind a settings flag `habitLinksMigrated`.
5. **Habit settings UI:** pick the linked kata from a template dropdown, with "custom label…" kept as a secondary option.
6. **T3 hook-up:** switch `sessionIntensity()` in `src/lib/pacing/load.ts` (if merged) to look up by ID first.
7. Include `kataTemplateId` in export/import, since it's already part of the Session schema. Add a CHANGELOG entry.

## Acceptance
- A migration test in `tests/unit/db/migrations.test.ts`: a v5 fixture with mixed-case and whitespace labels upgrades correctly, and unmatched labels are preserved.
- Rename test: renaming a template keeps habit progress intact.
- The existing `session-sync` tests still pass, with new ID-based cases added.
