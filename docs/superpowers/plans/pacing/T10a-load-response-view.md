# T10a: Load-response view (seed data only)

**Depends on:** T3, T4. **Does not wait** for weeks of real check-ins. **Blocks:** nothing. The case study is [T10b](T10b-case-study.md).

Parent spec: [T10](T10-load-response-insights.md). Load the `dataviz` skill before writing chart code.

## Scope
`src/components/insights/LoadResponse.tsx` on the Insights page, rendered from demo seed data and from the empty state:
- Timeline of daily load bars with next-day wellbeing on a second scale. Mark rest days and low-energy days.
- Lag scatter, lag 1 by default and a lag-2 toggle, with correlation, `n`, and a plain caption.
- Envelope line from `estimateEnvelope()`, or "Need N more days of check-ins" when data is insufficient.
- Count of `stoppedAtCap` sessions this month, framed as a win.
- Captions that say the sample is small and correlation is not causation.
- Works at 400px in both themes.

## Out of scope
Real check-in exports, screenshots, and the written case study.
