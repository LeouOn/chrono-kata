# Wave 14 Plan — Quick-Start Kata Templates & Ambient Web Audio Bells

**Date:** 2026-07-27
**Status:** Approved for Implementation

---

## 1. Overview & Objectives

Wave 14 minimizes practice initiation friction and enhances mindful focus sessions:
1. **Quick-Start Kata Templates**:
   - Reusable 1-tap practice presets stored in IndexedDB (e.g. *Morning Zazen 20m*, *Deep Work Sprint 45m*, *Kata Forms 50 reps*).
   - Displayed as a quick-start chip carousel on the Home dashboard (`/`) and inside `SessionForm`.
   - Full CRUD management in `Settings` and `/sessions`.
2. **Synthesized Web Audio Chimes & Interval Bells**:
   - Pure Web Audio API synthesis (zero audio asset downloads or latency).
   - Harmonic Tibetan singing bowl frequencies (fundamental + harmonics with exponential decay), soft meditation woodblock, and bell tones.
   - Start chime, completion chime, and configurable interval pings (e.g., chime every 5 or 10 minutes) during timed practice in `Timer.tsx`.

---

## 2. Technical Architecture & Schemas

### 2.1 Kata Template Schema (`src/lib/schemas/kata-template.ts`)
```typescript
export const KataTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  mode: z.enum(['timed', 'reps']),
  defaultDurationMinutes: z.number().int().positive().nullable().optional(),
  defaultReps: z.number().int().positive().nullable().optional(),
  activityLabel: z.string().max(50).optional(),
  defaultNote: z.string().max(500).optional(),
  icon: z.string().max(10).optional(), // Emoji, e.g. "🧘", "🥋", "💻"
  order: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### 2.2 Dexie Schema Version 3 (`src/lib/db/db.ts`)
Add table `kataTemplates: 'id, name, order, createdAt'`.

### 2.3 Web Audio Engine (`src/lib/audio/bell-synthesizer.ts`)
- `playTibetanBowl(ctx: AudioContext, frequency?: number, duration?: number)`
- `playMeditationBell(ctx: AudioContext)`
- `playIntervalChime(ctx: AudioContext)`
- `playCompletionGong(ctx: AudioContext)`

---

## 3. Implementation Tasks

- [ ] **Task 1: Kata Template Schema & Repository (TDD)**:
  - Create `src/lib/schemas/kata-template.ts` with Zod validation and defaults.
  - Bump Dexie DB version to 3 with `kataTemplates` table.
  - Implement `DexieKataTemplateRepository` in `src/lib/db/kata-template.repo.ts`.
  - Add unit tests in `tests/unit/db/kata-template.repo.test.ts`.

- [ ] **Task 2: Web Audio Synthesizer**:
  - Implement `src/lib/audio/bell-synthesizer.ts` with pure Web Audio harmonic synthesis.
  - Add unit test verifying audio parameter generation in `tests/unit/audio/bell-synthesizer.test.ts`.

- [ ] **Task 3: Quick-Start Carousel on Home Dashboard**:
  - Create `src/components/kata/KataQuickStart.tsx`.
  - Wire into `src/app/(main)/page.tsx` above or beside the streak flame.
  - Tapping a template immediately launches the timer or opens the pre-filled `SessionForm`.

- [ ] **Task 4: Interval Timer Integration in `Timer.tsx`**:
  - Add audio bell toggle and interval chime options (None, 5m, 10m, 15m, 20m) inside `Timer.tsx`.
  - Plays start chime on begin, interval chime on interval boundary, and completion chime on stop.

- [ ] **Task 5: Kata Template Manager in Settings**:
  - Add Kata Template list and creation modal in `src/app/(main)/settings/page.tsx`.

- [ ] **Task 6: Verification & Quality Gates**:
  - Unit tests, TypeScript check, ESLint check, and Next.js production build.
