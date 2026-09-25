# T5: Rules-first coach with validated output

**Depends on:** T2, T3. **Coordinate with:** T9, which touches `provider-fetch.ts` and `llm-settings.repo.ts`. T5 stays out of those files.

## Why
The LLM must not decide how much you should do. It phrases the decision from `recommend()` (T3). That keeps coaching consistent across providers, makes it testable, and stops a model from cheerfully urging you on during a low-energy day.

## Scope

### Payload (data minimization)
- New `buildPacingContext(...)` in `src/lib/llm/prompt-builders.ts`. It sends only:
  - the `recommend()` result (action, pct, reasons)
  - 7-day load total and the trend vs. the previous 7 days
  - the last 3 check-ins (numbers only, **no notes**)
  - streak days, and whether today is a rest day
  - optionally the last 3 sessions as `label | minutes | rating`, with no notes
- Rewrite `buildDailyBriefingUserText` to use it.

### Structured output
- Ask for JSON: `{ "summary": string, "suggestion": string, "tone": "gentle"|"steady"|"encouraging" }`.
- Parse with a Zod schema after fence stripping in `src/lib/llm/clean-response.ts`, extending it if needed.
- On a parse or validation failure, fall back to a deterministic template built from `recommend().reasons`, for example: "Low energy this morning. Today is a rest day. A short walk or stretches only if it feels good."
- Also reject any output whose suggestion contradicts the action. A simple keyword guard is enough, e.g. `rest`/`reduce` together with "push", "more than yesterday", or "challenge yourself" triggers the fallback.

### System prompt
- Append a shared pacing clause to every personality in `src/lib/coaches/*` (zen, hype, analyst, buddy, athena). Example: "The user is recovering from a chronic illness and uses activity pacing. Never encourage pushing through low energy or fatigue. Your suggestion must match the given action exactly; you phrase it, you don't change it."
- `hype` especially must obey. Test it.

### Caching
- `src/hooks/useDailyBriefing.ts`: the cache key becomes `date + personality + hash(pacingContext)`, so saving a check-in makes the next open regenerate the briefing. Keep the existing localStorage approach.

### Transparency
- In the LLM tab (`src/app/(main)/llm/page.tsx`), add a collapsible "What gets sent" section. It renders the exact payload from `buildPacingContext` for today, plus the active provider name.
- `DailyBriefingCard.tsx` shows `summary` and `suggestion`, and adds a small "fallback" indicator when the template was used.

## Acceptance
- Snapshot tests of the payload, confirming no notes and no raw history beyond the listed fields.
- Parser tests: valid JSON, fenced JSON, prose, a contradicting suggestion, and an empty string. Every case except the valid ones falls back.
- A test that every coach's system prompt contains the pacing clause.
- The existing E2E `daily-briefing-and-heatmap.spec.ts` still passes. Update its mocks.

## Out of scope
Per-session coach comments and weekly reflections. Apply the same minimization to them later if it's cheap, but it's not required.
