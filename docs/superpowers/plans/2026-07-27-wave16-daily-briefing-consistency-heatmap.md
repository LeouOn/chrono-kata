# Wave 16 Plan — Daily Coach Briefing & Interactive 365-Day Consistency Heatmap

**Date:** 2026-07-27
**Status:** Approved for Implementation

---

## 1. Overview & Objectives

Wave 16 brings macro-level long-term habit visualization and proactive daily AI guidance:
1. **Daily Coach Briefing & Adaptive Practice Recommendation**:
   - On the Home dashboard, a morning card with an on-demand AI Coach Briefing.
   - The active coach persona (Zen, Hype, Analyst, Buddy, Athena) examines:
     - Current streak and yesterday's practice duration
     - Average multi-dimensional ratings (focus, energy, mood)
     - Recommends an optimal practice style or duration for today.
2. **Interactive 365-Day Year-in-Pixels Practice Consistency Heatmap**:
   - Full GitHub / Waking Up-style annual heatmap rendered on `/insights`.
   - 52-week horizontal grid with color-coded practice intensity (minutes/reps).
   - Tooltip details on hover/tap displaying exact date, logged katas, and rating emojis.

---

## 2. Technical Architecture & Components

### 2.1 AI Daily Briefing Prompt & Cache (`src/lib/llm/daily-briefing.ts`)
- Context builder pulling last 7 days of sessions, active streak, and energy ratings.
- Cache stored in `reflections` or `daily_briefings` IndexedDB table to avoid redundant LLM calls on repeated page loads on the same date.

### 2.2 Year Consistency Heatmap Matrix (`src/lib/insights/yearly-matrix.ts`)
- Pure utility function generating a 52-week by 7-day array for any calendar year.
- Calculates daily practice volume, intensity levels (0 through 4), and day labels.

---

## 3. Implementation Tasks

- [ ] **Task 1: Annual Practice Matrix Utility (TDD)**:
  - Create `src/lib/insights/yearly-matrix.ts` calculating 365-day grid cells with intensity tiers.
  - Unit tests in `tests/unit/insights/yearly-matrix.test.ts`.

- [ ] **Task 2: YearlyConsistencyHeatmap Component**:
  - Implement `src/components/insights/YearlyConsistencyHeatmap.tsx` with responsive horizontal scrolling and interactive tooltips.
  - Integrate into `src/app/(main)/insights/page.tsx`.

- [ ] **Task 3: AI Daily Coach Briefing Engine**:
  - Implement `generateDailyBriefing` in `src/lib/llm/llm-service.ts` with coach personality tone.
  - Create `src/components/dashboard/DailyBriefingCard.tsx` on Home page.

- [ ] **Task 4: Quality Gates & Verification**:
  - Unit tests, TypeScript, ESLint, and production build verification.
