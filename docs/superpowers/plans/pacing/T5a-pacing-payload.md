# T5a: Pacing payload for the coach

**Depends on:** T2, T3. **Blocks:** T5b, T5c. **Stay out of:** `provider-fetch.ts` and `llm-settings.repo.ts` (T9).

Parent spec: [T5](T5-rules-first-coach.md). This slice is only the data the model is allowed to see.

## Scope
- `buildPacingContext(...)` in `src/lib/llm/prompt-builders.ts`. It calls `recommend()` and includes only:
  - the recommendation (`action`, `pct`, `reasons`)
  - the 7-day load total and the trend versus the previous 7 days
  - the last 3 check-ins as numbers, with no notes
  - streak days, and whether today is a rest day
  - optionally the last 3 sessions as `label | minutes | rating`, with no notes
- Rewrite `buildDailyBriefingUserText` to use that payload.
- Snapshot tests that fail if a note or any extra history field appears.

## Out of scope
Parsing the model reply (T5b). Cache keys and the briefing card (T5c).
