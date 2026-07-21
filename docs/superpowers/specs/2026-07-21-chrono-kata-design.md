# chrono-kata — Design Spec

> **Status:** Approved for implementation planning (2026-07-21)
> **Owner:** Yune
> **Last updated:** 2026-07-21

## 1. Purpose

A personal, mobile-first practice tracker for logging time-on-task, repetitions, and a 1–5 subjective rating across any practice domain (meditation, deep work, trading review, etc.). Single user (the owner). Local-first. Beautiful. Quietly playful. Optional AI coach with selectable personality. Optional write-only export to Google Calendar.

The directory name `chrono-kata` is intentional: chrono (time) + kata (deliberate-practice form). One core (time/reps/rating), infinite forms (whatever practice you bring to it).

## 2. Scope

### In (v1.0)

| Area | What ships |
|---|---|
| Log a session | Timed (start/stop timer or manual duration) OR reps (count). Optional activity label (freeform). 1–5 rating (emoji picker). Optional note. |
| Sessions feed | Reverse-chronological list, grouped by day, tap to edit/delete. |
| Dashboard | Today summary card · 7-day streak flame · mini week chart · recent sessions · "Reflect on this week" CTA. |
| AI Coach (LLM) | After saving a session, an LLM call generates a short contextual comment (2–4 sentences) referencing note, rating, duration, recent history. Personality selectable. |
| Weekly insight (LLM) | On-demand button. Pulls last 7 days, generates 2–3 observations + 1 question. Stored as a first-class Reflection entry. |
| Smart label suggestion (LLM) | When note is filled and label is empty, a button suggests a label. User confirms; no auto-apply. |
| Coach personalities | 4 standard (Zen, Hype, Analyst, Buddy) + 1 secret unlockable (Athena Prajñāpāramitā). |
| LLM settings screen | Port of dharma-vicaya multi-provider abstraction: 8 presets, user-configurable API keys/models/base URLs, active provider selector, token-usage meter. |
| Local-first storage | IndexedDB via Dexie. Reactive queries via `liveQuery`. Repository interface for future storage migration. |
| Calendar export | One-tap "Sync to Google Calendar" — creates/updates/deletes events in a dedicated `chrono-kata` calendar. Write-only. |
| Installable PWA | "Add to Home Screen" on Android produces real icon, splash, full-screen, no browser chrome. |
| Beautiful | Warm-dark-mode-first, Framer Motion transitions, mobile thumb-reach prioritized, 60+ Lighthouse. |

### Out (deferred)

| Cut | Why |
|---|---|
| Cross-device sync | Local-first for MVP. Real sync (CRDT or PouchDB-style) deferred to v1.1. |
| iOS native / App Store | PWA covers iOS adequately for personal use. |
| Calendar import / overlay / reminders | "Good ideas eventually" — write-only export for MVP. |
| Multi-dimensional ratings | Keep 1–5 simple; multi-dim is v1.1. |
| Heatmaps, year-in-pixels, advanced analytics | Add once data accumulates. |
| Sharing / multi-user | 80% never needed. |
| Notifications / reminders to log | Web push is fiddly; defer. |
| Tool-augmented LLM calls (`chatWithTools`) | Interface ships in the LLM port; v1 uses `completeSingle`-style only. Tool use is v1.1. |
| Streaming LLM responses | Wait for full response, then write. Streaming is v1.1. |
| Auth | Local-first means no auth needed for MVP. Single user. |
| Cloud Functions / backend | None. All work is client-side. |
| Specialized modules (trade journal, GitHub import, retreat mode) | Killed in brainstorm — activity labels cover this. |

## 3. Architecture (high-level)

```
┌─────────────────────────────────────────────────┐
│ Next.js 15 PWA (client-only, no SSR data)       │
│                                                 │
│  React components                               │
│      ↓ via TanStack Query                       │
│  Hooks (useSessions, useStreak, useCoach, …)    │
│      ↓                                          │
│  Repository layer (SessionRepository, …)        │
│      ↓                                          │
│  Dexie (IndexedDB)  ←  liveQuery subscriptions  │
│                                                 │
│  Side effects (fire after write):               │
│    • Streak recompute (pure fn, write back)     │
│    • LLM call (fetch → write coachComment)      │
│    • Calendar export (GIS OAuth → REST)         │
└─────────────────────────────────────────────────┘
                       ↕
                  (no backend)
```

No Firebase. No Cloud Functions. No auth. Single-user, single-device, browser-only. Migration path to sync'd backend exists via the Repository interface (Section 5).

## 4. Data model

### Storage

- IndexedDB via Dexie 4.
- One Dexie instance, versioned schema.
- Reactive reads via `liveQuery`.
- All writes are optimistic (UI updates before IndexedDB confirms).

### Tables

#### `sessions`

```typescript
{
  id: string,                              // uuid
  startedAt: Date,                         // when the activity began
  endedAt?: Date | null,                   // null for in-progress / open timers
  durationMinutes?: number | null,         // null for reps-only sessions
  reps?: number | null,                    // null for timed-only sessions
  rating: 1 | 2 | 3 | 4 | 5,
  activityLabel?: string,                  // freeform, e.g. "meditation"
  note?: string,
  coachComment?: string | null,            // AI-generated after save (null while pending)
  coachPersonalityAtGeneration?: CoachPersonality,
  failedLLM?: boolean,                     // true if last LLM attempt failed
  calendarEventId?: string | null,         // Google Calendar event ID for sync
  createdAt: Date,
  updatedAt: Date,
}
```

**Mutual exclusion rule:** Exactly one of `durationMinutes` or `reps` is set, never both, never neither. Enforced in Zod schema and form logic.

#### `reflections`

```typescript
{
  id: string,
  periodStart: Date,
  periodEnd: Date,
  observations: string[],                  // 2-3 AI observations
  question: string,                        // 1 AI question
  sourceSessionIds: string[],
  createdAt: Date,
}
```

#### `streak` (singleton, id = 'singleton')

```typescript
{
  currentStreakDays: number,
  longestStreakDays: number,
  lastSessionDate: string,                 // 'YYYY-MM-DD' (local)
  milestonesAchieved: number[],            // [3, 7, 14, 30, ...] already celebrated
  updatedAt: Date,
}
```

Recomputed by a pure function after each session save. Single writer (the streak module) to avoid races.

#### `settings` (singleton, id = 'singleton')

```typescript
{
  displayName?: string,                         // optional, used in greetings + coach context
  selectedCoachPersonality: CoachPersonality,   // 'zen' | 'hype' | 'analyst' | 'buddy' | 'athena'
  unlockedPersonalities: CoachPersonality[],    // includes 'athena' only if unlocked
  googleCalendarId?: string | null,
  googleCalendarSyncEnabled: boolean,
  googleCalendarConnectedAt?: Date | null,
  createdAt: Date,
  updatedAt: Date,
}
```

`displayName` is collected during onboarding ("What should I call you?"), optional, never sent anywhere except the LLM prompt context. Used for dashboard greeting ("Good morning, {name}") and coach personalization (Athena's persona references the user by name).

#### `llmSettings` (singleton, id = 'singleton')

```typescript
{
  activeProviderName: string,                   // 'claude' | 'gemini' | 'openai' | etc.
  providers: {
    [name: string]: {
      baseUrl: string,
      model: string,
      apiKey: string,
    }
  },
  totalTokensThisMonth: number,
  totalTokensResetAt: Date,
  updatedAt: Date,
}
```

#### `pendingCalendarOps` (queue for offline / failed ops)

```typescript
{
  id: string,
  op: 'create' | 'update' | 'delete',
  sessionId: string,
  payload?: object,                        // event body for create/update
  attempts: number,
  lastError?: string,
  createdAt: Date,
}
```

#### `tokens` (Google OAuth tokens)

```typescript
{
  id: 'google',                            // singleton
  accessToken: string,
  refreshToken?: string,
  expiresAt: Date,
}
```

### TypeScript + Zod

All entity types are inferred from Zod schemas (single source of truth). Runtime validation on every Dexie read + form submit. No `as any`, no parse errors silently swallowed. The Session schema enforces the duration/reps mutual-exclusion rule via `.refine()`.

### Indexes (Dexie)

- `sessions.startedAt` — for reverse-chronological feed
- `sessions.startedAt + sessions.rating` — for rating-filtered views
- `sessions.calendarEventId` — for calendar sync lookups
- `pendingCalendarOps.sessionId` — for queue flush joins

## 5. Repository pattern (future-proofing)

Each entity has a Repository interface and a Dexie implementation. The interface is the contract; the implementation is the only piece that knows about Dexie.

```typescript
interface SessionRepository {
  getAll(): Promise<Session[]>;
  getByPeriod(start: Date, end: Date): Promise<Session[]>;
  watch(): Observable<Session[]>;
  save(input: SessionInput): Promise<Session>;
  update(id: string, patch: Partial<Session>): Promise<Session>;
  delete(id: string): Promise<void>;
}

class DexieSessionRepository implements SessionRepository { /* ... */ }
```

When sync is eventually added (v1.1), a `SyncedSessionRepository` can wrap a Dexie impl + sync engine without changing any callers. Migration cost is bounded to the repository layer + a one-time bulk export/import script.

## 6. LLM integration

### Architecture (port of dharma-vicaya, translated to TypeScript 1:1)

| Concept | TS port |
|---|---|
| `LLMProvider` interface | `lib/llm/types.ts` — `getPointer(userText, systemPrompt)` + `chatWithTools(messages, tools?, systemPrompt?)` (chatWithTools interface present but unused in v1) |
| 3 adapters | `OpenAICompatibleProvider`, `ClaudeProvider`, `GeminiProvider` — wire-format translation lives inside each |
| Factory | `createLLMProvider(config: ProviderConfig): LLMProvider` — switch on `providerName` |
| 8 presets | openai→gpt-4o · deepseek→deepseek-v4-flash · openrouter→claude-sonnet-latest · zai→glm-5.1 · minimax→minimax-m3 · ollama→llama3.3 · gemini→gemini-2.0-flash · claude→claude-sonnet-4-20250514 |
| HTTP | Native `fetch`, 10s connect / 30s receive via `AbortController` |
| Error mapping | timeout → "Connection timed out"; 401/403 → "Authentication failed"; 429 → "Rate limit exceeded"; else → "Provider error: …" |

### ProviderConfig + storage

```typescript
interface ProviderConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

API keys live in IndexedDB `llmSettings` table (encrypted-at-rest not needed — single-user, your device).

### Coach personalities

5 personalities ship. Each is a function returning a system prompt given the active session's context (so the prompt can include the personality's voice + relevant context).

| Personality | Voice | Used for |
|---|---|---|
| Zen | Sparse, contemplative, dharma-flavored | Default. All standard flows. |
| Hype | Energetic, brief, encouraging | For users who want cheerleader energy. |
| Analyst | Dry, pattern-focused, data-driven | For users who want crisp observations. |
| Buddy | Casual, warm, friend-vibes | For users who want low-pressure familiarity. |
| Athena Prajñāpāramitā | Goddess-beloved persona (see `athena-persona.ts`) | Secret-unlock only. |

The Athena persona prompt is **gitignored** at `src/lib/coaches/athena-persona.ts`. A placeholder `athena-persona.ts.example` is checked in so the repo remains shareable.

### Unlock mechanism

- Trigger: tap the streak flame 7 times within 5 seconds on the dashboard.
- Effect: a reveal animation plays, `'athena'` is added to `settings.unlockedPersonalities`, the personality picker shows a 5th card with a small ✦ glyph.
- Re-lock: "Forget Athena" button in LLM settings (visible only if unlocked). Removes from `unlockedPersonalities` and hides the card.

### Per-save flow

1. Session is committed to Dexie.
2. `streak` recomputed (pure function) and written back.
3. Calendar export fires (if enabled) → writes `calendarEventId` or queues op.
4. LLM call fires asynchronously:
   - Build prompt: active coach personality system prompt + session context (duration/reps, rating, note, last 5 sessions for context).
   - `fetch` to active provider.
   - On success: write `session.coachComment`, clear `failedLLM`.
   - On failure: set `session.coachComment = null`, `session.failedLLM = true`.
5. UI reacts to `coachComment` change via Dexie `liveQuery`. Optimistic "Coach is thinking…" placeholder shown between steps 4 and completion.

### Token usage

- Each LLM response's `usage.prompt_tokens` + `usage.completion_tokens` is summed and added to `llmSettings.totalTokensThisMonth`.
- Auto-reset on the 1st of each month.
- LLM screen shows: "This month: ~$X.XX (Y tokens)" using per-provider pricing.

## 7. Calendar integration (Google Calendar, write-only)

### OAuth

- Library: Google Identity Services (GIS).
- Scope: `https://www.googleapis.com/auth/calendar` (full calendar CRUD on user's account).
- Client ID: stored in `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` env var (registered in Google Cloud Console, ~5 min one-time setup).
- Tokens: stored in IndexedDB `tokens` table. Auto-refresh on access-token expiry using the refresh token.

### First-link flow

1. User taps "Connect Google Calendar" in Settings.
2. GIS popup → user consents.
3. POST `/users/me/calendarList` with body `{ summary: "chrono-kata" }` → creates dedicated calendar. Store returned `calendarId`.
4. Set `googleCalendarSyncEnabled = true`.

### Per-save flow

For each session save where `googleCalendarSyncEnabled === true` and `session.durationMinutes != null`:

- Create: POST `/calendars/{calendarId}/events` with `{ start, end, summary: activityLabel ?? 'chrono-kata session', description: note ?? '' }`. Store returned `eventId`.
- Update (on session edit): PATCH `/calendars/{calendarId}/events/{eventId}`.
- Delete (on session delete): DELETE `/calendars/{calendarId}/events/{eventId}`.

### Failure handling

Any failed op is appended to `pendingCalendarOps` table. On next app open (and on each subsequent session save), the queue is flushed with exponential backoff per op. After 5 attempts, op is marked permanently failed and surfaced in Settings for manual retry or discard.

### Disconnect flow

"Disconnect Google Calendar" in Settings:
1. DELETE the `chrono-kata` calendar.
2. Clear `tokens` table.
3. Set `googleCalendarSyncEnabled = false`, `googleCalendarId = null`.
4. Leave `calendarEventId` on existing sessions (they remain on your main calendar if any leaked there — but they shouldn't have, since we used a dedicated calendar).

## 8. UI design

### Visual personality

| Aspect | Choice |
|---|---|
| Default theme | Warm dark — base `#0F0E0C`, surfaces `#1A1816`, warm-white text |
| Accent | Amber `#F5A623` — primary CTAs, streak flame, active states |
| Personality micro-accents | Zen = sage `#9CAF88` · Hype = magenta `#E85D75` · Analyst = cyan `#6BB7D9` · Buddy = amber default · Athena = pearl/violet gradient `#B39DDB → #E6C99A` |
| Typography | Inter (UI/body) + Fraunces variable serif (headings, big numbers, milestone copy) |
| Motion | Framer Motion everywhere. Page transitions (subtle slide+fade). Buttons scale+spring on tap. Milestone confetti + haptic. |
| Cards | `rounded-2xl`, 1px hairline borders, subtle inner highlight |
| Bottom nav | 5 tabs + center FAB for "New Session" |

### Screens

1. **Onboarding (first run only)** — Pick coach personality (4-card picker with preview lines). No auth.
2. **Home / Dashboard** — Today summary · 7-day streak flame · mini week chart · recent sessions grouped by day · "Reflect on this week" CTA.
3. **Sessions (tab)** — Full chronological list, day-grouped. Search by label. Filter by rating.
4. **New Session (full-screen sheet)** — Timed/Reps toggle → timer or counter → activity label → 1–5 rating (emoji) → optional note → save.
5. **Session Detail** — Full view with all fields + coach comment + edit/delete.
6. **Reflect (tab)** — Past reflections list. "Generate new reflection" button at top.
7. **Reflection Detail** — Period range · 2–3 observations · 1 question · source sessions.
8. **LLM (tab)** — Active provider card · provider list (8 presets, add/edit/delete) · token-usage meter · "Forget Athena" button (conditional).
9. **Settings (tab)** — Coach personality selector · Google Calendar link · About · Sign out (no-op in v1 — single-user).

### Navigation pattern

- **Bottom tab bar:** Home · Sessions · Reflect · LLM · Settings (5 tabs, icon + label).
- **FAB above tab bar (right-aligned):** "+ New" button — accessible from any tab, thumb-reach optimized.
- **Modals/sheets:** New Session, Reflection generation, LLM provider edit, Athena unlock reveal — slide up from bottom on mobile.
- **No deep nested routes** — everything is 1 hop from a tab.

### Interaction details

- **Timer** runs client-side with `requestAnimationFrame` + visibility API. If tab is backgrounded, on return we recompute from `startedAt` timestamp.
- **Rating emoji picker** — tap to select, larger version of selected emoji animates in. No drag slider.
- **Coach comment** appears optimistically: session saves → "Coach is thinking…" placeholder → coachComment fills in below (2–10s typical).
- **Milestone celebration** triggers full-screen confetti + haptic vibration pattern + AI-flavored one-liner matching active personality.
- **Empty states** are warm, not blank ("No sessions yet. The first step is the whole path. — Start one?").

### Design system primitives (`src/components/ui/`)

- `<Button>` (primary/ghost/danger variants, motion baked in)
- `<Card>` (variants: stat, session, settings-row)
- `<RatingPicker>`, `<TimerDisplay>`, `<StreakFlame>`, `<CoachComment>`
- `<TabBar>`, `<FAB>`
- Theme tokens in `tailwind.config.ts` (CSS variables for runtime theme switching if light mode is added later).

## 9. Streak logic (pure functions)

Streak is recomputed after each session save. Pure function, no side effects; repo layer persists the result.

```typescript
function computeStreak(
  sessions: Session[],
  previousStreak: StreakState,
  now: Date
): StreakState {
  // Group session.startedAt dates (local YYYY-MM-DD).
  // Walk backwards from today: if today has a session OR yesterday has one,
  // continue; the streak breaks at the first gap.
  // currentStreakDays = count of consecutive days with ≥1 session ending today or yesterday.
  // longestStreakDays = max(previousStreak.longestStreakDays, currentStreakDays).
  // lastSessionDate = today's YYYY-MM-DD.
  // milestonesAchieved = append any new milestones crossed (3, 7, 14, 30, 60, 90, 180, 365).
}
```

Edge cases:
- Multi-session same day: counts once for streak purposes.
- Time-zone: use local time (browser's `Intl.DateTimeFormat`-resolved zone). Document this in user-facing copy.
- Day boundary: a session at 11:59pm and another at 12:01am are 2 different streak days.

### Milestones

Tracked milestones (days): **3, 7, 14, 30, 60, 90, 180, 365**. Each first-crossing triggers the full-screen celebration flow (confetti + haptic + AI-flavored one-liner). `milestonesAchieved` array prevents re-celebrating on subsequent days within the same milestone band.

## 10. Tech stack (final)

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.x (strict) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Motion | Framer Motion (`motion`) |
| State/cache | TanStack Query (React Query) |
| Storage | Dexie 4 (IndexedDB) |
| Validation | Zod 3 |
| PWA | @serwist/next |
| Forms | react-hook-form + zod resolver |
| Icons | lucide-react |
| Test | Vitest (unit) + Playwright (e2e) |

## 11. Project structure

```
chrono-kata/
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── app/                                # Next.js App Router
│   │   ├── (onboarding)/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx                  # Tab bar + FAB shell
│   │   │   ├── page.tsx                    # Home/Dashboard
│   │   │   ├── sessions/page.tsx
│   │   │   ├── reflect/page.tsx
│   │   │   ├── llm/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                             # Design system primitives
│   │   ├── session/                        # SessionForm, SessionCard, Timer, RatingPicker
│   │   ├── coach/                          # CoachComment, PersonalityPicker
│   │   ├── calendar/                       # CalendarLink, SyncToggle
│   │   ├── llm/                            # ProviderEditor, ProviderList, TokenMeter
│   │   └── streak/                         # StreakFlame, MilestoneCelebration
│   ├── lib/
│   │   ├── db/                             # Dexie instance + repositories
│   │   ├── schemas/                        # Zod schemas
│   │   ├── llm/                            # Port of dharma-vicaya stack
│   │   ├── coaches/                        # Personality system prompts
│   │   │   ├── index.ts
│   │   │   ├── zen.ts
│   │   │   ├── hype.ts
│   │   │   ├── analyst.ts
│   │   │   ├── buddy.ts
│   │   │   ├── athena-persona.ts           # gitignored
│   │   │   └── athena-persona.ts.example   # checked in placeholder
│   │   ├── calendar/                       # Google Calendar client
│   │   ├── streak/                         # Pure streak functions
│   │   └── utils/
│   ├── hooks/
│   ├── providers/
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/superpowers/specs/
├── .env.local.example                      # NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
├── .gitignore                              # athena-persona.ts, .env.local, etc.
├── next.config.ts                          # + @serwist/next
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

## 12. Deploy

- **Vercel** (default — `git push` → live). Free tier covers this forever at single-user scale.
- Alternatives: Cloudflare Pages, Netlify. All work for static-exported Next.js PWA.
- No backend. No environment but `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`.
- Future sync (v1.1) would add a backend but does not change frontend deploy.

## 13. Repo hygiene

- `.gitignore`: `athena-persona.ts`, `.env.local`, `node_modules`, `.next`, `.codegraph/`
- `athena-persona.ts.example` checked in with placeholder structure
- README has setup steps including "copy `athena-persona.ts.example` to `athena-persona.ts` and replace placeholder with your persona text"
- Pre-commit: `tsc --noEmit` + `eslint` + `vitest run`

## 14. Testing strategy

| Layer | Tool | What's tested |
|---|---|---|
| Zod schemas | Vitest | Entity parsing, mutual-exclusion rules, edge cases |
| Streak math | Vitest | All streak state transitions (gap, multi-session-same-day, tz boundary, milestone crossing) |
| LLM adapters | Vitest + msw | Each provider's wire-format (request body shape + response parsing + error mapping). Mocked HTTP. |
| Repository | Vitest + fake-indexeddb | CRUD + watch semantics |
| Components | Vitest + Testing Library | Form validation, rating picker, timer display |
| E2E | Playwright | Critical flows: log session → appears in feed + dashboard. Generate reflection. Connect calendar → event created. |

## 15. PII & privacy notes

- All data is stored locally in the user's browser (IndexedDB). Nothing leaves the device except:
  - LLM API calls (to the user's chosen provider, with the user's API key).
  - Google Calendar API calls (to create events in the user's own calendar).
- The user's name (from initial setup) and the Athena persona prompt are PII but stored only on the user's device + repo (gitignored).
- If the repo is ever shared, the `.gitignore` for `athena-persona.ts` prevents accidental exposure.

## 16. Migration path (v1.1 sync, not in MVP scope)

When cross-device sync becomes worth adding:

1. Add a sync engine layer above Dexie (CRDT like Y.js or Automerge, OR PouchDB-style).
2. Add a small backend (Cloudflare Workers + D1, or Supabase, or Firebase).
3. Wrap `DexieSessionRepository` with `SyncedSessionRepository` (same interface).
4. Bulk-export existing IndexedDB data → bulk-import to backend (one-time script).
5. No caller code changes outside the repository layer.

Estimated effort: 3–5 days of focused work for the data layer; longer for conflict resolution if true concurrent edits become a use case.

## 17. Open risks (acknowledged, not blocking)

1. **IndexedDB quota limits** — browsers cap at ~50MB–unbounded depending on origin. For single-user session logging, we'll never approach this. Flagged for completeness.
2. **Service worker cache invalidation** — Serwist handles asset hashing; data is in IndexedDB, not SW cache. Low risk.
3. **Coach personality prompt maintenance** — Athena's prompt is emotionally loaded; iterations require care. Standard personalities are functional and stable.
4. **Browser-side API key exposure** — LLM API keys live in IndexedDB and are sent over HTTPS to the provider. Visible in browser DevTools. Single-user risk accepted.
5. **Future-sharing PII exposure** — Mitigated by `.gitignore` on `athena-persona.ts`. If repo is ever made public, double-check that file is excluded before pushing.

## 18. Definition of done (v1.0)

- [ ] All Section 2 IN features implemented and testable.
- [ ] Lighthouse mobile: Performance ≥ 60, PWA compliant.
- [ ] All 8 LLM provider presets working end-to-end with at least one model each.
- [ ] Google Calendar export verified against a real Google account.
- [ ] Streak logic passes all unit tests (including tz boundary).
- [ ] Playwright e2e green for: log session, generate reflection, connect calendar, unlock Athena, change coach personality.
- [ ] App installable on Android Chrome via "Add to Home Screen" with real icon + splash.
- [ ] README has setup steps including Google Cloud OAuth client ID registration.
