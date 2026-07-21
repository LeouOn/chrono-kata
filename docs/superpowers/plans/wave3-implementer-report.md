# Wave 3 — LLM Stack — Implementer Report

**Status:** `DONE_WITH_CONCERNS`
**Date:** 2026-07-21
**Commits added:** 10 (`96714a7` → `dd9ff84`)
**Tests:** 40 baseline → **70/70 pass** (+30 new LLM tests)
**Typecheck:** exit 0
**Build:** succeeds, 9/9 static pages generated

---

## Per-task log

### Task 1 — LLM types + ProviderConfig + 11 provider presets — `96714a7`

**Did:** Created `src/lib/llm/types.ts` (`StopReason`, `ChatResponse`, `LLMException`, `LLMExceptionKind`, `LLMProvider`), `provider-config.ts` (`ProviderConfig`), `provider-defaults.ts` (`PROVIDER_DEFAULTS`, `PROVIDER_NAMES`, `adapterFor`).

**Verification:** `npm run typecheck` exit 0.

**Deviation / Plan bug:** The plan brief says "11 provider presets" repeatedly (lines 18, 2450) but enumerates only 10 in the code (lines 168–178): `openai, deepseek, deepseek-pro, openrouter, zai, minimax, nemotron, ollama, gemini, claude`. I implemented exactly the 10 the plan's code specifies. The 11th is unspecified — flagged as a plan ambiguity.

---

### Task 2 — Error mapper + tests — `b21cd8d`

**Did:** Wrote `tests/unit/llm/error-mapper.test.ts` (RED) then implemented `src/lib/llm/error-mapper.ts` (GREEN) with `mapResponseStatus` + `mapFetchError`.

**Verification:** `npm test -- error-mapper` → 9 tests pass (plan said 8; counted 5 status + 4 fetch = 9 — minor count miss in the plan).

---

### Task 3 — OpenAI-compatible adapter + tests — `446c7e8`

**Did:** TDD: `tests/unit/llm/openai-compatible-provider.test.ts` → `src/lib/llm/openai-compatible-provider.ts`. Handles bearer auth, JSON body, 401/429 mapping, reasoning_content parsing.

**Verification:** 5/5 tests pass.

---

### Task 4 — Claude + Gemini + factory + tests — `6be9a6e`

**Did:** TDD: three test files + three implementations (`claude-provider.ts`, `gemini-provider.ts`, `provider-factory.ts`).

**Verification:** 24/24 LLM tests pass total (9 error-mapper + 5 openai-compat + 3 claude + 2 gemini + 5 factory).

---

### Task 5 — Prompt builders + LLM service — `416e661`

**Did:** Wrote `tests/unit/llm/prompt-builders.test.ts`, implemented `prompt-builders.ts` (`buildSessionContextSummary`, `buildCoachUserText`, `buildWeeklyReflectionUserText`) and `llm-service.ts` (`generateCoachComment`, `generateWeeklyReflection`, `suggestLabel`).

**Verification:** 6/6 prompt-builder tests pass + typecheck exit 0.

**Bugs in plan code I fixed:**
1. **StopReason enum mismatch.** Plan used `stopReason: 'endTurn' as const` in all three adapters. `StopReason` is a TS enum, so the string literal `"endTurn"` is not assignable to it. Fixed by importing `StopReason` and writing `stopReason: StopReason.EndTurn`.
2. **Test null-check failures.** Plan's `error-mapper.test.ts` does `const e = mapResponseStatus(401, ...); expect(e.kind)` — but `mapResponseStatus` returns `LLMException | null`, which strict-mode flags. Fixed by adding `expect(e).not.toBeNull()` + non-null assertion `e!.kind`.
3. **ProviderConfig mismatch in tests.** Plan's adapter tests construct e.g. `new OpenAICompatibleProvider({ baseUrl, apiKey, model })` without `providerName`, but `ProviderConfig` requires it. Fixed by adding `providerName: 'openai'` (etc.) to each test constructor.
4. **`lessThan` custom matcher.** Per the user's special note, the plan's `lessThan` helper is non-standard Vitest and didn't work. Replaced `expect(s).toHaveLength(lessThan(120))` with `expect(s.length).toBeLessThan(120)`.
5. **Regex mismatch in `buildCoachUserText` test.** Plan's implementation emits the label `"Recent sessions (most recent first):"` but the test asserts `/Recent sessions:/` (colon immediately after "sessions"). The colon doesn't immediately follow in the output. Minimal fix: relaxed the test regex to `/Recent sessions/`.

---

### Task 6 — LLM settings repo extension + hook — `acbd75d`

**Did:** Extended `LLMSettingsRepository` interface AND `DexieLLMSettingsRepository` class with `addProvider`, `removeProvider`, `setActive`, `incrementTokenUsage`. Created `src/hooks/useLLMSettings.ts` (TanStack Query, queryKey `['llmSettings']`, optimistic cache updates).

**Verification:** typecheck exit 0.

---

### Task 7 — Wire coach comment generation into save flow — `c12b86f`

**Did:** Modified `src/hooks/useSessions.ts` to call `generateCoachCommentSideEffect(session)` fire-and-forget (`void promise`) in `createMutation.onSuccess`. Side effect:
- Skips silently if no provider configured.
- On success: updates session with `coachComment`, `coachPersonalityAtGeneration`, `failedLLM=false`; bumps token counter.
- On failure: marks `failedLLM=true`, logs warning, swallows Offline errors silently (per plan).
- Exposed as `retryCoachComment` in hook return for future retry UI.

**Verification:** typecheck exit 0.

---

### Task 8 — Coach comment UI + smart-label button — `6b5fe89`

**Did:** Modified `SessionCard.tsx` to render "Coach is thinking…" placeholder (when `!coachComment && !failedLLM && ageMs < 60s`), personality-colored left border on rendered comments (using CSS vars `--color-zen`/`-hype`/`-analyst`/`-buddy`/`-athena-from`), and a "Coach unavailable. Tap to retry." state for older failures. Modified `SessionForm.tsx` to show a ✨ Suggest button next to the activity label when `note.trim().length > 20 && !activityLabel`. Button uses dynamic `import()` to lazy-load `suggestLabel` from the LLM service (per user's special note — keeps SessionForm bundle small). All errors swallowed silently with `console.warn`.

**Verification:** typecheck exit 0.

---

### Task 9 — LLM settings UI — `263b554`

**Did:** Created `TokenMeter.tsx` (monthly token count + USD estimate), `ProviderEditor.tsx` (modal with baseUrl/model/apiKey fields), `ProviderList.tsx` (renders all 10 presets with status: Active / Not configured / Edit / Add / Remove / Set active). Replaced `/llm/page.tsx` placeholder with the full provider management UI.

**Verification:** typecheck exit 0.

---

### Task 10 — Reflect page + final verification — `dd9ff84`

**Did:** Created `useReflections.ts` hook (TanStack mutation that fetches last 7 days of sessions via `sessionRepo.getByPeriod`, calls `generateWeeklyReflection`, persists via `reflectionRepo.save`, bumps token counter). Created `ReflectionCard.tsx`. Replaced `/reflect/page.tsx` placeholder with the generate button + reflection list.

**Verification:** see final commands below.

---

## Final verification commands

### `git log --oneline` (last 15)

```
dd9ff84 feat: weekly reflection UI + generate flow
263b554 feat: LLM settings UI - 11 provider presets + token meter
6b5fe89 feat: coach comment UI + smart label suggestion button
c12b86f feat: wire coach comment generation into session save flow
acbd75d feat: llm settings repo token tracking + useLLMSettings hook
416e661 feat: prompt builders + LLM service (coach, reflection, label)
6be9a6e feat: claude + gemini adapters + provider factory + tests
446c7e8 feat: OpenAI-compatible adapter + tests
b21cd8d feat: LLM error mapper with tests
96714a7 feat: LLM types + ProviderConfig + 11 provider presets
dbb5303 feat: milestone celebration overlay with confetti
e20ffbf feat: session detail page + FAB wired to session form
32e9562 feat: populated dashboard with today summary + week chart + recent feed
43b9f77 feat: sessions list grouped by day + new-session modal
76ed0c6 feat: Timer + SessionForm for create/edit flow
```

### `npm run typecheck`

```
> chrono-kata@1.0.0 typecheck
> tsc --noEmit

(exit 0)
```

### `npm test` (summary)

```
Test Files  13 passed (13)
     Tests  70 passed (70)
  Duration  6.00s
```

Per-file breakdown:
- `tests/unit/llm/claude-provider.test.ts` — 3
- `tests/unit/llm/openai-compatible-provider.test.ts` — 5
- `tests/unit/streak/milestones.test.ts` — 6
- `tests/unit/utils/date.test.ts` — 4
- `tests/unit/llm/error-mapper.test.ts` — 9
- `tests/unit/streak/compute-streak.test.ts` — 8
- `tests/unit/db/session.repo.test.ts` — 6
- `tests/unit/llm/gemini-provider.test.ts` — 2
- `tests/unit/schemas/settings.test.ts` — 3
- `tests/unit/llm/provider-factory.test.ts` — 5
- `tests/unit/schemas/session.test.ts` — 6
- `tests/unit/utils/format.test.ts` — 7
- `tests/unit/llm/prompt-builders.test.ts` — 6

### `npm run build`

```
▲ Next.js 15.5.21
✓ Compiled successfully in 5.2s
✓ Generating static pages (9/9)

Route (app)                                 Size  First Load JS
┌ ○ /                                    2.72 kB         215 kB
├ ○ /_not-found                            996 B         105 kB
├ ○ /llm                                 5.19 kB         189 kB
├ ○ /onboarding                             2 kB         199 kB
├ ○ /reflect                             1.56 kB         204 kB
├ ○ /sessions                            1.54 kB         211 kB
├ ● /sessions/[id]                       1.33 kB         210 kB
└ ○ /settings                            1.66 kB         198 kB
+ First Load JS shared by all             104 kB

○  (Static)   prerendered as static content
●  (Dynamic)  server-rendered on demand
```

---

## Wave 3 DoD checklist

| Item | Status |
|---|---|
| `npm run typecheck` exits 0 | ✅ |
| `npm test` — all tests pass (60+ tests) | ✅ 70/70 |
| `npm run build` succeeds | ✅ |
| 3 LLM adapters (OpenAI-compatible, Claude, Gemini) implemented with wire-format tests | ✅ |
| 11 provider presets available in `/llm` settings | ⚠️ 10 of "11" — see deviation below |
| Adding a provider + setting active persists to IndexedDB | ✅ (code path verified via typecheck + repo unit-tested pattern; runtime DB write not exercised in test) |
| After session save with a configured provider, a coach comment is generated and stored on the session | ✅ (verified by code inspection; runtime not exercised without real API key) |
| If no provider is configured, save succeeds silently (no crash, no "Coach is thinking…") | ✅ (`generateCoachCommentSideEffect` early-returns when `providers` is empty; UI condition also gates on `failedLLM` flag) |
| If `navigator.onLine === false`, save succeeds without attempting LLM call | ✅ (`generateCoachComment` throws `Offline` before any fetch; side effect swallows `Offline` silently) |
| If LLM call fails (bad key, 500, etc.), session is marked `failedLLM = true`, no retry storm | ✅ (single try/catch in side effect; no retry on failure) |
| Token usage increments after each LLM call; token meter on `/llm` reflects usage | ✅ (`incrementTokenUsage` called after success in both `generateCoachCommentSideEffect` and `useReflections.generate`) |
| Smart label suggestion button appears in SessionForm when note > 20 chars and label is empty | ✅ (`{note.trim().length > 20 && !activityLabel && <button>}`) |
| Weekly reflection can be generated from `/reflect` page; result stored as Reflection doc | ✅ (code path verified; runtime not exercised without real API key) |
| No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source | ✅ |

---

## Deviations from plan

1. **"11 provider presets" vs 10 enumerated.** Plan brief (lines 5, 18, 71, 2450) says "11" but the actual `PROVIDER_DEFAULTS` code (lines 167–178) lists 10. Implemented exactly the 10 specified in the plan's code. The 11th is unspecified — did not invent one. Flagged as plan ambiguity.
2. **StopReason enum string-literal bug.** Plan code wrote `stopReason: 'endTurn' as const` (string) where `StopReason` is an enum. Fixed to `StopReason.EndTurn` in all three adapters.
3. **Test null-check failures in error-mapper test.** Plan's tests accessed `.kind` on `LLMException | null`. Fixed with non-null assertions.
4. **Test ProviderConfig shape mismatch.** Plan's adapter tests omitted `providerName` from constructor args. Fixed by adding the field to each test config.
5. **`lessThan` custom matcher.** Per user's special note, the non-standard matcher failed. Replaced with native `toBeLessThan`.
6. **`/Recent sessions:/` regex mismatch.** Plan implementation produces "Recent sessions (most recent first):"; plan test regex required colon right after "sessions". Relaxed test to `/Recent sessions/` (no colon) — preserves the implementation's more descriptive label.
7. **`useReflections.ts` unused imports dropped.** Plan imported `LLMException`, `LLMExceptionKind`, `toLocalDateString` but never used them in the body. Dropped to keep the file clean.
8. **`incrementTokenUsage` schema validation.** The existing `LLMSettingsSchema` uses Zod parsing internally for `save()`, but the plan calls `db.llmSettings.put(updated)` directly in the new methods (bypassing the schema-level parse). This mirrors the existing `save()` pattern in the Wave 1 repo, so I kept the plan's approach for consistency rather than introducing a parse step.

---

## Plan code bugs fixed (summary)

1. `'endTurn' as const` → `StopReason.EndTurn` (3 files: openai-compatible, claude, gemini providers)
2. Test null-check assertions for `mapResponseStatus` (1 file: error-mapper.test.ts)
3. Missing `providerName` field in adapter test constructors (3 files: openai-compatible, claude, gemini provider tests)
4. `lessThan` matcher replaced with native matcher (1 file: prompt-builders.test.ts)
5. Regex mismatch in coach user text test (1 file: prompt-builders.test.ts)

---

## Concerns

- **Runtime verification gap.** None of the LLM call paths were exercised end-to-end against a real provider (no API key in test environment). Verification was limited to typecheck, unit tests with mocked `fetch`, and build success. The actual coach-comment-after-save flow, weekly reflection generation, and smart-label suggestion would benefit from a manual smoke test against a real provider before declaring fully shipped.
- **`PROVIDER_DEFAULTS` "11 vs 10" mismatch** should be resolved with the spec author before merging.
- **No retry storm** is enforced purely by single-shot `try/catch` in `generateCoachCommentSideEffect`. If `retryCoachComment` is later wired into a "Tap to retry" UI button, that UI must implement its own debounce / single-flight.
