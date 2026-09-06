# UX Hardening — Design

**Date:** 2026-09-06
**Status:** Approved design, pending implementation plan
**Origin:** User session — "improve the readme status, check delete + add confirm/don't-show-again setting, revise emojis, check activity labels, fix modal limitations"

## Context

The app is at Wave 16+ (daily AI briefing, consistency heatmap, kata templates, habit goals, multi-provider LLM chat, Google Calendar export). Investigation found:

- README "Status" still says "Wave 1: Foundation".
- Kata delete is instant — the only destructive action with no confirmation. `ConfirmDialog` exists and is already used for session delete, calendar disconnect, and import overwrite.
- Settings → "Clear all data" button has **no onClick handler** (dead button).
- `suggestLabel()` in `llm-service.ts` is complete but wired to nothing (dead code). Activity labels are free-text; Insights groups by them with an `(unlabeled)` bucket.
- Shared `Modal` lacks: Escape-to-close, focus trap/restore, body scroll-lock, dialog aria attributes, and a stacking strategy for nested overlays (all modals are `z-50`).
- Kata icon choices are a hardcoded 10-emoji array.

## User-approved decisions

1. **Confirmations:** per-action toggles — confirm dialog with "Don't ask again" checkbox for each destructive action, plus a Settings card to re-enable each.
2. **Emoji icons:** expand to ~24 categorized emoji in a wrap-grid.
3. **Activity labels:** autocomplete from history/templates **plus** wiring the existing LLM `suggestLabel()`.
4. **Modal:** full a11y/UX bundle (Escape, focus trap + restore, scroll-lock, aria, stacking prop).
5. **Implementation approach A:** flat booleans in `SettingsSchema` + enhanced `ConfirmDialog` (no imperative confirm manager, no context provider).

## Goals

1. README reflects the current build state.
2. Destructive actions confirm before acting; each confirmation is skippable via "Don't ask again" and reversible from Settings.
3. "Clear all data" actually works.
4. Richer kata icon picker, backward compatible with existing icons.
5. Label entry gets offline suggestions and optional LLM suggestion.
6. Shared Modal meets baseline a11y/UX.

## Non-goals

- No "project" entity — activity labels remain the grouping mechanism.
- No drag-to-reorder for katas (buttons stay).
- No changes to rating-emoji picker or other emoji surfaces.
- Calendar disconnect and import-overwrite confirms stay as-is (always confirm, no toggle).
- No i18n, no new dependencies.

## Feature designs

### 1. README status

Replace the Status section with current reality (Wave 16+, e2e hardening) and add a short feature list (tracker, kata quick-start, AI coach + chat, insights, calendar export, themes, goals/streaks, PWA). Content-only edit; no code.

### 2. Per-action confirmations

**Schema** (`src/lib/schemas/settings.ts`):
- `confirmKataDelete`, `confirmSessionDelete`, `confirmClearData` — `z.boolean().optional()`, all default `true` in `DEFAULT_SETTINGS`.

**ConfirmDialog** (`src/components/ui/ConfirmDialog.tsx`):
- New optional prop `showDontAskAgain?: boolean`.
- When set, renders a small checkbox ("Don't ask again") above the button row; checkbox state is internal and resets on each open.
- `onConfirm` signature becomes `(dontAskAgain: boolean) => void`. Existing `() => void` callbacks remain assignable (TypeScript contravariance) — calendar and DataTransfer call sites need no changes.

**Call-site pattern** (each destructive site):
1. Read its flag from `useSettings`.
2. If flag is `false` → perform the action immediately.
3. Otherwise open `ConfirmDialog` with `showDontAskAgain`; on confirm: if `dontAskAgain` → `updateSettings({ <flag>: false })`, then perform the action.

**Sites:**
- **Kata delete** (`KataTemplateSettings.tsx`): new confirm — "Delete kata '{name}'? Its history in past sessions is kept." → `deleteTemplate(id)`.
- **Session delete** (`sessions/[id]/page.tsx`): existing confirm gains `showDontAskAgain` + flag short-circuit.
- **Clear all data** (`settings/page.tsx`): dead button fixed. Extract to a small card component; on confirm → `db.delete()` (Dexie) then `window.location.reload()`. IndexedDB only — the `onboarding-completed` localStorage key is deliberately preserved (fresh data, same onboarding).

**Settings UI** — new `src/components/settings/ConfirmationSettings.tsx` card ("Confirmations") with three toggles: "Before deleting a kata", "Before deleting a session", "Before clearing all data". Placed after `KataTemplateSettings` on the Settings page. Toggle components follow the pattern used by `ThemeSettings`/`ReminderSettings`.

### 3. Kata icon picker

**Data** — new `src/lib/kata/icons.ts`:
- `KATA_ICON_CATEGORIES: { label: string; icons: string[] }[]` with four categories — **Mind**, **Movement**, **Craft & Work**, **Life** — ~24–28 emoji total.
- Must include all 10 legacy icons (🥋 🧘 ⚡ 📖 💻 🏃 🎨 🎯 🌊 🔥) so existing template icons remain selectable.
- Schema unchanged — icon stays a free string; unknown/legacy icons render as-is (existing `t.icon || '🥋'` fallback covers empties).

**UI** (`KataTemplateSettings.tsx` modal): for each category, a tiny muted label + `flex-wrap` grid of emoji buttons; single selection outline exactly as today.

### 4. Activity label suggestions

**Data** — new `src/lib/utils/labels.ts`:
- `buildLabelSuggestions(sessions: Session[], templates: KataTemplate[], current: string): string[]`
- Union of session `activityLabel`s and template `activityLabel`s; dedupe case-insensitively; exclude the current input value; order by most recently used (session `startedAt` desc), templates appended after; cap at 6.

**UI** (`SessionForm.tsx`, under the label input):
- Chips row ("Recent:" implicit — just chips): small pill buttons; tap sets `activityLabel`. Rendered only when suggestions are non-empty.
- **Suggest action:** sparkle button at the right of the label input. Enabled only when `note.trim()` is non-empty and the LLM settings resolve to an active provider (reuse the `resolveActiveProvider` / `useLLMSettings` check from `llm-service.ts` — at least one provider with credentials). On click: brief loading state → `suggestLabel({ note, llmSettings })` → fill `activityLabel` (respecting the 50-char input cap). On failure: toast via `useToast`; label input unchanged.

### 5. Modal a11y/UX bundle (`src/components/ui/Modal.tsx`)

- **Escape:** document `keydown` listener while open → `onClose`.
- **Scroll-lock:** `document.body.style.overflow = 'hidden'` while open; restored in cleanup.
- **Focus management:** on open, remember `document.activeElement`; focus the panel (`tabIndex={-1}`) or first focusable; trap Tab/Shift+Tab within the panel; on close, restore focus to the remembered element (after exit animation completes — handle in cleanup).
- **ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at a `useId`-generated id on the title element. When no title, omit `aria-labelledby`.
- **Stacking:** optional `layer?: 1 | 2` prop (default 1). Layer 1 → `z-50`; layer 2 → `z-[60]` on backdrop and panel — available for future nested confirms. No current call site needs it.
- `ConfirmDialog` and all forms inherit everything for free.

### 6. Testing

**Unit (Vitest + Testing Library, jsdom):**
- Settings schema: three new booleans parse; `DEFAULT_SETTINGS` has all `true`.
- `icons.ts`: every category non-empty; no duplicate emoji across categories; all 10 legacy icons present.
- `labels.ts`: dedupe (case-insensitive), exclusion of current value, recency ordering, cap at 6.
- `ConfirmDialog`: checkbox renders only with `showDontAskAgain`; `onConfirm(true/false)` reflects checkbox; state resets between opens.
- `Modal`: Escape calls `onClose`; body overflow locked while open and restored on close; `role`/`aria-modal` present; Tab cycles within panel (basic trap assertion).
- Existing suites stay green (`npm run typecheck && npm run lint && npm run test`).

**Manual smoke (dev server):** all three confirm flows incl. "Don't ask again" + re-enable from Settings; clear-all-data wipe + reload; icon picker categories; label chips; Suggest with a configured provider (and disabled state without one); Escape closes each modal; background doesn't scroll under an open modal.

**E2E:** existing Playwright specs must stay green — no selector changes in flows they cover; label chips are additive below the input and don't alter the label field's position in the DOM order the tests target.

## Risks & mitigations

- **Focus restore vs. exit animation:** AnimatePresence unmounts after exit — restore focus in effect cleanup, which runs at unmount. Verify manually.
- **`db.delete()` with open connections:** Dexie closes handles on delete; the immediate reload guarantees a clean slate. Verify the wipe path manually.
- **`suggestLabel` latency:** existing `withTimeout` guard; loading state + disabled button prevents double-fire.
- **Mobile keyboards + chips:** chips are plain buttons (no datalist) — no iOS quirks expected.

## Files touched

| File | Change |
|---|---|
| `README.md` | Status + features rewrite |
| `src/lib/schemas/settings.ts` | 3 confirmation booleans + defaults |
| `src/components/ui/ConfirmDialog.tsx` | `showDontAskAgain`, `onConfirm(dontAskAgain)` |
| `src/components/ui/Modal.tsx` | a11y/UX bundle, `layer` prop |
| `src/components/settings/KataTemplateSettings.tsx` | delete confirm, categorized picker |
| `src/app/(main)/sessions/[id]/page.tsx` | session-delete checkbox + flag short-circuit |
| `src/app/(main)/settings/page.tsx` | working Clear-all-data card, ConfirmationSettings mount |
| `src/components/settings/ConfirmationSettings.tsx` | new — toggles card |
| `src/lib/kata/icons.ts` | new — categorized icon data |
| `src/lib/utils/labels.ts` | new — `buildLabelSuggestions` |
| `src/components/session/SessionForm.tsx` | chips row + Suggest action |
| `src/lib/db/db.ts` | read-only (verify export for `db.delete()`) |
| `tests/unit/…` | new tests per §6 |
