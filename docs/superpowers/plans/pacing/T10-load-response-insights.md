# T10: Load-response insights view + case study

**Depends on:** T3, T4, and **~3–4 weeks of real check-in data.** Don't start early; the analysis is meaningless without the data.

## Why
This is the payoff: a personal estimate of how much activity the body can absorb without a crash. It's also the lead portfolio piece, bringing health, data, and engineering together as one honest N-of-1 story.

## Scope

### Insights view: `src/components/insights/LoadResponse.tsx` on the Insights page
Load the `dataviz` skill before writing chart code.
- **Timeline:** daily load bars, with next-day wellbeing as a line on a secondary scale. Mark rest days and low-energy days.
- **Lag scatter:** load on day N vs. wellbeing on day N+1, with a lag-2 toggle. Show the correlation, `n`, and a plain-language caption.
- **Envelope:** the estimate from `estimateEnvelope()`, as a horizontal line on the timeline with a confidence label. When `insufficientData`, show "Need N more days of check-ins".
- **Cap success:** a count of sessions with `stoppedAtCap` this month, framed as a win.
- Use honest captions: small sample, correlation isn't causation, and confounders like sleep, weather, and other stress.

### Case study: `docs/case-study-load-response.md`
- The question, the data collected, the method (lagged pairs, Spearman, a bucketed envelope), results with charts (screenshots), the caveats, and what changed in behavior.
- Export the anonymized aggregates (daily load + wellbeing only) as CSV for reproducibility. Get the user's approval before committing any data.

## Acceptance
- The view renders with the demo seed data and with the empty/insufficient state.
- It works at 400px, in both themes.
- The write-up is reviewed by the user before publishing anywhere.
