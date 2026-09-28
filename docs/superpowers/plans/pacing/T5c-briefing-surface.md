# T5c: Briefing cache and what-gets-sent

**Depends on:** T5a and T5b. **Stay out of:** `provider-fetch.ts` and `llm-settings.repo.ts` (T9).

Parent spec: [T5](T5-rules-first-coach.md).

## Scope
- `useDailyBriefing.ts`: cache key is `date + personality + hash(pacingContext)`, still in localStorage, so a new check-in regenerates the briefing.
- `DailyBriefingCard.tsx` shows `summary` and `suggestion`, and a small fallback mark when the template was used.
- LLM tab: a collapsible "What gets sent" section that renders today's `buildPacingContext` payload and the active provider name.
- Update `tests/e2e/daily-briefing-and-heatmap.spec.ts` so it still passes.

## Out of scope
Per-session coach comments and weekly reflections.
