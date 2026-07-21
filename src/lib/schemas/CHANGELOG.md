# Schema Changelog

Tracks breaking and additive changes to Zod schemas in this directory.
Additive changes (new optional fields) only require a Zod edit.
Breaking changes (field renames, type changes, removals) require BOTH a
Zod schema version bump AND a Dexie migration step.

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