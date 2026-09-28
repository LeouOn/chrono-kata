# T5b: Coach output guard and pacing clause

**Depends on:** T5a. **Blocks:** T5c. **Stay out of:** `provider-fetch.ts` and `llm-settings.repo.ts` (T9).

Parent spec: [T5](T5-rules-first-coach.md).

## Scope
- Ask for JSON `{ summary, suggestion, tone: "gentle"|"steady"|"encouraging" }`.
- Parse it in `src/lib/llm/clean-response.ts` after fence stripping. Valid JSON passes. Fenced JSON, prose, an empty string, or a suggestion that contradicts the action (`rest`/`reduce` plus "push", "more than yesterday", or "challenge yourself") falls back to a deterministic sentence built from `recommend().reasons`.
- Append the shared pacing clause to every personality in `src/lib/coaches/*`, including `hype`.
- Tests: parser cases above, and a test that every coach prompt contains the clause.

## Out of scope
The briefing cache and the "What gets sent" panel (T5c).
