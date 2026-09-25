# T3: Pacing engine (pure TypeScript)

**Depends on:** T1. **Blocks:** T5, T6, T10.

## Why
The rules decide and the model only phrases. This module is the "rules" half: deterministic, fully tested, and with no UI or LLM involvement.

**Land `src/lib/pacing/types.ts` first, in a small early PR**, so T5 and T6 can code against it.

## Scope

### Intensity
- Add an optional `intensity: 1 | 2 | 3` to `KataTemplate` (`src/lib/schemas/kata-template.ts`): 1 is gentle, 2 moderate, 3 hard. It's non-indexed, so no Dexie bump is needed. Add a selector in `KataTemplateSettings.tsx`.
- Sessions don't store a template ID yet (T8 adds that). Until then, resolve a session's intensity by matching `activityLabel` to the template name (case- and whitespace-insensitive), defaulting to 1. Put this in one function, `sessionIntensity(session, templates)`, so T8 can switch it to ID lookup.
- T4 also adds a field to `kata-template.ts`. Whichever of the two merges second rebases; the conflict is trivial.

### `src/lib/pacing/load.ts`
- `dailyLoad(sessions, templates): Map<YYYY-MM-DD, number>`, where load = Σ `durationMinutes × intensity`. Reps-only sessions count as `reps × REP_MINUTES` (a documented constant, e.g. 0.1), or are excluded. Pick one and document it.
- `rollingLoad(daily, endDate, days)`.

### `src/lib/pacing/response.ts`
- Normalize a check-in to a single `wellbeing` score of 0–1: energy (and optionally sleep), with fog and aches inverted. Export the weights.
- `laggedPairs(daily, checkIns, lag: 1|2)` gives `[load on day N, wellbeing on day N+lag]`. Treat days with no sessions as load 0, and skip days without a check-in.
- `correlation(pairs)` returns Spearman and Pearson with `n`.
- `estimateEnvelope(pairs)` finds the load threshold above which mean next-day wellbeing drops by ≥ X. A simple bucketed approach is fine. Return `{ envelope, n, confidence: 'low'|'medium' }`, or `{ insufficientData: true }` when n < 14.

### `src/lib/pacing/recommend.ts`
```ts
recommend({ today, checkIns, dailyLoad, envelope }): {
  action: 'rest' | 'reduce' | 'hold' | 'build'
  pct?: number              // for reduce/build
  targetLoad?: number
  reasons: string[]         // short, human-readable, used by T5 fallback text
}
```
Rules, as a starting point. Document them as a table in the file header.
- Today's energy ≤ 2, **or** a drop of ≥ 2 points from the 3-day average → `rest`.
- Yesterday's load > envelope, or wellbeing is trending down over 3 days → `reduce` by 20%.
- Stable wellbeing and load within the envelope → `hold`.
- Wellbeing ≥ 0.7 for 5+ days and load ≤ 80% of the envelope → `build` by ≤ 10%.
- **Invariant:** never `build` when today's energy ≤ 3. Never `build` without a check-in today.
- No check-in today → `hold`, with the reason "no check-in yet".

## Acceptance
- Table-driven Vitest tests for every rule and invariant, plus edge cases (empty data, a single day, gaps, all-zero load).
- A property-style test: the result is never `build` when energy ≤ 3.
- All functions pure. Dates come from the caller, never `new Date()` inside.

## Out of scope
UI, the LLM, and streaks.
