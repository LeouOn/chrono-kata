# UX Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the UX-hardening spec — per-action delete confirmations with "Don't ask again", a working Clear-all-data button, categorized kata icons, label suggestions (chips + LLM), the Modal a11y bundle, and a current README.

**Architecture:** Approach A from the spec — three flat booleans on the existing `SettingsSchema`, an enhanced `ConfirmDialog` that reports its "Don't ask again" checkbox through `onConfirm(dontAskAgain)`, call sites that short-circuit on their flag, two new pure modules (`icons.ts`, `labels.ts`), and the a11y work concentrated in the shared `Modal`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind 4 (semantic tokens: `bg-surface-2`, `text-text-muted`, `accent-accent`, …), motion/react, lucide-react, Zod 3, Vitest + Testing Library (jsdom, `fireEvent` — **no @testing-library/user-event in this repo**), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-ux-hardening-design.md`

## Global Constraints

- TypeScript strict — never `as any`, `@ts-ignore`, or `@ts-expect-error`.
- No new npm dependencies.
- Styling uses existing semantic Tailwind tokens only (`bg-surface`, `bg-surface-2`, `text-text`, `text-text-muted`, `border-border`, `accent`, `hype`); no raw hex colors in JSX.
- Icons come from `lucide-react`; animations from `motion/react`.
- Tests: Vitest with global jsdom env + `tests/setup.ts` (fake-indexeddb, jest-dom). Use `fireEvent` from `@testing-library/react`, not user-event (not installed).
- Run a single test file: `npx vitest run <path>`; full gate: `npm run precommit` (typecheck + lint + all tests).
- Conventional commits, one per task, staging only that task's files.
- All UI copy in the app's established voice (calm, direct, sentence case).

---

### Task 1: Confirmation flags on SettingsSchema

**Files:**
- Modify: `src/lib/schemas/settings.ts`
- Test: `tests/unit/schemas/settings.test.ts`

**Interfaces:**
- Consumes: existing `SettingsSchema` / `DEFAULT_SETTINGS`.
- Produces: `Settings.confirmKataDelete?: boolean`, `Settings.confirmSessionDelete?: boolean`, `Settings.confirmClearData?: boolean` — all default `true`. Tasks 6, 7, 9 read them via `useSettings()`; Task 9 writes them via `updateSettings({ <flag>: boolean })`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('SettingsSchema', ...)` block in `tests/unit/schemas/settings.test.ts`:

```ts
  it('defaults all confirmation toggles to true', () => {
    expect(DEFAULT_SETTINGS.confirmKataDelete).toBe(true);
    expect(DEFAULT_SETTINGS.confirmSessionDelete).toBe(true);
    expect(DEFAULT_SETTINGS.confirmClearData).toBe(true);
  });

  it('parses confirmation toggles set to false', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      confirmKataDelete: false,
      confirmSessionDelete: false,
      confirmClearData: false,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confirmKataDelete).toBe(false);
      expect(result.data.confirmSessionDelete).toBe(false);
      expect(result.data.confirmClearData).toBe(false);
    }
  });

  it('rejects non-boolean confirmation toggles', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      confirmKataDelete: 'yes',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/schemas/settings.test.ts`
Expected: FAIL — `confirmKataDelete` does not exist on `DEFAULT_SETTINGS` (TS error in test) / parse assertions fail.

- [ ] **Step 3: Implement**

In `src/lib/schemas/settings.ts`, add to `SettingsSchema` immediately after the `ratingStyle` line (line 28):

```ts
  confirmKataDelete: z.boolean().optional(),
  confirmSessionDelete: z.boolean().optional(),
  confirmClearData: z.boolean().optional(),
```

And in `DEFAULT_SETTINGS`, immediately after `ratingStyle: 'slider',` (line 51):

```ts
  confirmKataDelete: true,
  confirmSessionDelete: true,
  confirmClearData: true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/schemas/settings.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/settings.ts tests/unit/schemas/settings.test.ts
git commit -m "feat: add per-action confirmation settings flags"
```

---

### Task 2: Modal a11y/UX bundle

**Files:**
- Modify: `src/components/ui/Modal.tsx`
- Test: `tests/unit/ui/modal.test.tsx` (new — create `tests/unit/ui/` directory)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Modal` with unchanged existing props plus optional `layer?: 1 | 2` (default 1). Behavior all downstream components inherit: Escape closes (`onClose`), body scroll locked while open, focus moves into panel and is trapped, focus restored on close, panel has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` when `title` is set.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ui/modal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        hidden
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes dialog semantics with title association', () => {
    render(
      <Modal open onClose={() => {}} title="Dialog title">
        content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Dialog title');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>content</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = render(<Modal open onClose={() => {}}>content</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('moves focus to the panel and traps Tab within it', () => {
    render(
      <Modal open onClose={() => {}} title="T">
        <button>first</button>
        <button>last</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const buttons = dialog.querySelectorAll('button');
    const first = buttons[0]!;
    const last = buttons[1]!;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ui/modal.test.tsx`
Expected: FAIL — no `role="dialog"` found; Escape does nothing; `body.style.overflow` stays `''`.

- [ ] **Step 3: Implement — replace the entire contents of `src/components/ui/Modal.tsx`**

```tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** Stack layer: 1 = normal (z-50), 2 = rendered above another modal (z-[60]). */
  layer?: 1 | 2;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({ open, onClose, children, title, layer = 1 }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Keep a ref to onClose so the effect does not resubscribe when callers
  // pass inline arrow functions (which get a new identity every render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const zClass = layer === 2 ? 'z-[60]' : 'z-50';

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    panel?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zClass} flex items-end sm:items-center justify-center`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-base/70 backdrop-blur-sm"
            onClick={() => onCloseRef.current()}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className="relative bg-surface border-t border-border sm:border sm:rounded-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl outline-none"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {title && (
              <div className="sticky top-0 bg-surface px-5 pt-5 pb-3 border-b border-border">
                <h2 id={titleId} className="font-serif text-xl text-text">{title}</h2>
              </div>
            )}
            <div className="px-5 pb-6 pt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ui/modal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full unit suite to catch regressions in Modal consumers**

Run: `npm test`
Expected: PASS — existing suites green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx tests/unit/ui/modal.test.tsx
git commit -m "feat: modal a11y bundle (escape, focus trap, scroll lock, aria)"
```

---

### Task 3: ConfirmDialog "Don't ask again"

**Files:**
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Test: `tests/unit/ui/confirm-dialog.test.tsx` (new)

**Interfaces:**
- Consumes: `Modal` from Task 2.
- Produces: `ConfirmDialog` props gain `showDontAskAgain?: boolean` (default `false`); `onConfirm` is now `(dontAskAgain: boolean) => void`. Existing zero-arg callbacks (calendar disconnect, DataTransfer import) remain assignable — no changes needed there.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ui/confirm-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const baseProps = {
  open: true,
  title: 'Delete?',
  message: 'This cannot be undone.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('renders no checkbox by default', () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reports false when confirming without ticking the checkbox', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('reports true when the checkbox is ticked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('resets the checkbox between opens', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain open={false} />);
    rerender(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain open />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('calls onCancel from the cancel button', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ui/confirm-dialog.test.tsx`
Expected: FAIL — no checkbox role exists; `onConfirm` called with no arguments (`toHaveBeenCalledWith(false)` fails on `toHaveBeenCalledWith()`).

- [ ] **Step 3: Implement — replace the entire contents of `src/components/ui/ConfirmDialog.tsx`**

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  showDontAskAgain?: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showDontAskAgain = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (open) setDontAskAgain(false);
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-text-muted mb-4">{message}</p>
      {children && <div className="mb-4">{children}</div>}
      {showDontAskAgain && (
        <label className="flex items-center gap-2 mb-4 text-xs text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          Don&apos;t ask again
        </label>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={() => onConfirm(dontAskAgain)}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ui/confirm-dialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify existing consumers still typecheck**

Run: `npm run typecheck`
Expected: no errors (`CalendarSettings` and `DataTransfer` zero-arg callbacks are assignable to the widened `onConfirm`).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/ConfirmDialog.tsx tests/unit/ui/confirm-dialog.test.tsx
git commit -m "feat: confirm dialog don't-ask-again support"
```

---

### Task 4: Categorized kata icon set

**Files:**
- Create: `src/lib/kata/icons.ts`
- Test: `tests/unit/kata/icons.test.ts` (new — create `tests/unit/kata/` directory)

**Interfaces:**
- Consumes: nothing.
- Produces: `KATA_ICON_CATEGORIES: { label: string; icons: string[] }[]` and `ALL_KATA_ICONS: string[]`. Task 6 renders the categories.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/kata/icons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KATA_ICON_CATEGORIES, ALL_KATA_ICONS } from '@/lib/kata/icons';

// The original 10 hardcoded choices — existing templates may use any of these.
const LEGACY_ICONS = ['🥋', '🧘', '⚡', '📖', '💻', '🏃', '🎨', '🎯', '🌊', '🔥'];

describe('KATA_ICON_CATEGORIES', () => {
  it('has four non-empty categories with labels', () => {
    expect(KATA_ICON_CATEGORIES.length).toBe(4);
    for (const category of KATA_ICON_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.icons.length).toBeGreaterThan(0);
    }
  });

  it('has at least 20 icons total', () => {
    expect(ALL_KATA_ICONS.length).toBeGreaterThanOrEqual(20);
  });

  it('has no duplicate icons across categories', () => {
    expect(new Set(ALL_KATA_ICONS).size).toBe(ALL_KATA_ICONS.length);
  });

  it('includes every legacy icon so existing templates stay selectable', () => {
    const set = new Set(ALL_KATA_ICONS);
    for (const icon of LEGACY_ICONS) {
      expect(set.has(icon)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/kata/icons.test.ts`
Expected: FAIL — cannot resolve `@/lib/kata/icons`.

- [ ] **Step 3: Implement**

Create `src/lib/kata/icons.ts`:

```ts
export interface KataIconCategory {
  label: string;
  icons: string[];
}

/** Categorized icon choices for kata templates (legacy 10 all preserved). */
export const KATA_ICON_CATEGORIES: KataIconCategory[] = [
  { label: 'Mind', icons: ['🧘', '🧠', '📿', '🕯️', '🌙', '☯️'] },
  { label: 'Movement', icons: ['🥋', '🏃', '🚴', '🏋️', '🧗', '🥊'] },
  { label: 'Craft & Work', icons: ['💻', '📖', '✍️', '🎨', '🎸', '⚡', '🔬'] },
  { label: 'Life', icons: ['🔥', '🌊', '🎯', '🌱', '⭐', '🍵'] },
];

export const ALL_KATA_ICONS: string[] = KATA_ICON_CATEGORIES.flatMap((c) => c.icons);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/kata/icons.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kata/icons.ts tests/unit/kata/icons.test.ts
git commit -m "feat: categorized kata icon set"
```

---

### Task 5: Label suggestion builder

**Files:**
- Create: `src/lib/utils/labels.ts`
- Test: `tests/unit/utils/labels.test.ts` (new)

**Interfaces:**
- Consumes: `Session` (`@/lib/schemas/session`), `KataTemplate` (`@/lib/schemas/kata-template`).
- Produces: `buildLabelSuggestions(sessions: Session[], templates: KataTemplate[], current: string): string[]` and `LABEL_SUGGESTION_LIMIT = 6`. Task 8 consumes.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utils/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLabelSuggestions, LABEL_SUGGESTION_LIMIT } from '@/lib/utils/labels';
import type { Session } from '@/lib/schemas/session';
import type { KataTemplate } from '@/lib/schemas/kata-template';

function makeSession(label: string | undefined, startedAt: Date): Session {
  return {
    id: crypto.randomUUID(),
    startedAt,
    endedAt: null,
    durationMinutes: 10,
    reps: null,
    rating: 3,
    activityLabel: label,
    note: undefined,
    coachComment: null,
    failedLLM: undefined,
    calendarEventId: null,
    focusRating: null,
    energyRating: null,
    moodRating: null,
    conversationId: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function makeTemplate(label: string): KataTemplate {
  return {
    id: crypto.randomUUID(),
    name: 'T',
    mode: 'timed',
    defaultDurationMinutes: 20,
    defaultReps: null,
    activityLabel: label,
    defaultNote: undefined,
    icon: '🥋',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('buildLabelSuggestions', () => {
  it('returns session labels newest-first, then template labels', () => {
    const older = makeSession('meditation', new Date('2026-01-01T10:00:00Z'));
    const newer = makeSession('kata', new Date('2026-02-01T10:00:00Z'));
    expect(buildLabelSuggestions([older, newer], [makeTemplate('Deep Work')], '')).toEqual([
      'kata',
      'meditation',
      'Deep Work',
    ]);
  });

  it('sorts by startedAt regardless of input order', () => {
    const older = makeSession('old', new Date('2026-01-01T10:00:00Z'));
    const newer = makeSession('new', new Date('2026-02-01T10:00:00Z'));
    expect(buildLabelSuggestions([older, newer], [], '')).toEqual(['new', 'old']);
  });

  it('dedupes case-insensitively and keeps the first casing seen', () => {
    const a = makeSession('Meditation', new Date('2026-01-02T10:00:00Z'));
    const b = makeSession('meditation', new Date('2026-01-01T10:00:00Z'));
    expect(buildLabelSuggestions([a, b], [], '')).toEqual(['Meditation']);
  });

  it('excludes the current input value case-insensitively', () => {
    const s = makeSession('Meditation', new Date());
    expect(buildLabelSuggestions([s], [], 'meditation')).toEqual([]);
  });

  it('caps at the limit, keeping the most recent', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession(`label-${i}`, new Date(2026, 0, i + 1))
    );
    const result = buildLabelSuggestions(sessions, [], '');
    expect(result).toHaveLength(LABEL_SUGGESTION_LIMIT);
    expect(result[0]).toBe('label-9');
  });

  it('skips undefined and blank labels', () => {
    const a = makeSession(undefined, new Date());
    const b = makeSession('   ', new Date());
    expect(buildLabelSuggestions([a, b], [makeTemplate('x')], '')).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/utils/labels.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/labels`.

- [ ] **Step 3: Implement**

Create `src/lib/utils/labels.ts`:

```ts
import type { Session } from '@/lib/schemas/session';
import type { KataTemplate } from '@/lib/schemas/kata-template';

export const LABEL_SUGGESTION_LIMIT = 6;

/**
 * Recent-label suggestions for the session form.
 * Sessions contribute newest-first; template labels follow. Case-insensitive
 * dedupe; the current input value is excluded; result is capped.
 */
export function buildLabelSuggestions(
  sessions: Session[],
  templates: KataTemplate[],
  current: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const currentKey = current.trim().toLowerCase();

  const push = (raw: string | undefined): void => {
    if (!raw) return;
    const label = raw.trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (key === currentKey || seen.has(key)) return;
    seen.add(key);
    result.push(label);
  };

  const newestFirst = [...sessions].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );
  for (const s of newestFirst) push(s.activityLabel);
  for (const t of templates) push(t.activityLabel);

  return result.slice(0, LABEL_SUGGESTION_LIMIT);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/utils/labels.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/labels.ts tests/unit/utils/labels.test.ts
git commit -m "feat: label suggestion builder"
```

---

### Task 6: Kata delete confirmation + categorized picker

**Files:**
- Modify: `src/components/settings/KataTemplateSettings.tsx`

**Interfaces:**
- Consumes: `confirmKataDelete` setting (Task 1), `ConfirmDialog` with `showDontAskAgain` (Task 3), `KATA_ICON_CATEGORIES` (Task 4), `useSettings()` → `{ settings, updateSettings }`, `useKataTemplates()` → `{ templates, deleteTemplate, ... }` (existing).

- [ ] **Step 1: Update imports and state**

In `src/components/settings/KataTemplateSettings.tsx`:

Replace lines 1–12 (imports and `ICON_CHOICES`):

```tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useKataTemplates } from '@/hooks/useKataTemplates';
import { useSettings } from '@/hooks/useSettings';
import type { KataTemplate, KataTemplateInput } from '@/lib/schemas/kata-template';
import { formatDuration } from '@/lib/utils/format';
import { KATA_ICON_CATEGORIES } from '@/lib/kata/icons';
```

(The `const ICON_CHOICES = [...]` line is deleted.)

Inside `KataTemplateSettings()`, after line 15 (`useKataTemplates` destructure) add:

```tsx
  const { settings, updateSettings } = useSettings();
  const [deleteTarget, setDeleteTarget] = useState<KataTemplate | null>(null);
```

- [ ] **Step 2: Add delete handlers**

After the `openCreate` function, add:

```tsx
  function handleDeleteClick(t: KataTemplate) {
    if (settings?.confirmKataDelete === false) {
      void deleteTemplate(t.id);
    } else {
      setDeleteTarget(t);
    }
  }

  async function handleDeleteConfirm(dontAskAgain: boolean) {
    if (dontAskAgain) await updateSettings({ confirmKataDelete: false });
    if (deleteTarget) await deleteTemplate(deleteTarget.id);
    setDeleteTarget(null);
  }
```

And change the row delete button (currently `onClick={() => void deleteTemplate(t.id)}`) to:

```tsx
              <button
                type="button"
                onClick={() => handleDeleteClick(t)}
                className="p-1 text-text-muted hover:text-hype transition-colors"
                title="Delete kata"
              >
                <Trash2 size={14} />
              </button>
```

- [ ] **Step 3: Render the confirm dialog**

Immediately before the closing `</Card>` (after the edit `</Modal>`), add:

```tsx
      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete kata?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? Past sessions keep their labels.`
            : ''
        }
        confirmLabel="Delete"
        showDontAskAgain
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
```

- [ ] **Step 4: Replace the flat icon picker with categories**

In the kata form modal, replace the single Icon picker block:

```tsx
          {/* Icon picker */}
          <div>
            <label className="text-text-muted block mb-1">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {ICON_CHOICES.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`text-xl p-1.5 rounded-xl transition-transform ${
                    icon === ic ? 'bg-accent/20 scale-110 border border-accent' : 'bg-surface-2'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
```

with:

```tsx
          {/* Icon picker */}
          <div>
            <label className="text-text-muted block mb-1">Icon</label>
            <div className="max-h-44 overflow-y-auto pr-1">
              {KATA_ICON_CATEGORIES.map((category) => (
                <div key={category.label} className="mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
                    {category.label}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {category.icons.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setIcon(ic)}
                        className={`text-xl p-1.5 rounded-xl transition-transform ${
                          icon === ic
                            ? 'bg-accent/20 scale-110 border border-accent'
                            : 'bg-surface-2'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck; npm test`
Expected: typecheck clean; all unit tests pass (no test covers this component; behavior verified manually in Task 10).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/KataTemplateSettings.tsx
git commit -m "feat: confirm kata deletion + categorized icon picker"
```

---

### Task 7: Session delete "Don't ask again"

**Files:**
- Modify: `src/app/(main)/sessions/[id]/page.tsx`

**Interfaces:**
- Consumes: `confirmSessionDelete` setting (Task 1), `ConfirmDialog` with `showDontAskAgain` (Task 3), `useSettings()`.

- [ ] **Step 1: Add the settings hook**

Add the import with the other hook imports (after the `useConversation` import):

```tsx
import { useSettings } from '@/hooks/useSettings';
```

Inside `SessionDetailPage()`, after line 30 (`useSessions` destructure), add:

```tsx
  const { settings, updateSettings } = useSettings();
```

- [ ] **Step 2: Change delete handling**

Replace the current `handleDelete` (lines 60–64):

```tsx
  async function handleDelete() {
    await deleteSession(session!.id);
    setDeleteOpen(false);
    router.push('/sessions');
  }
```

with:

```tsx
  async function handleDelete(dontAskAgain: boolean) {
    if (dontAskAgain) await updateSettings({ confirmSessionDelete: false });
    await deleteSession(session!.id);
    setDeleteOpen(false);
    router.push('/sessions');
  }

  function handleDeleteClick() {
    if (settings?.confirmSessionDelete === false) {
      void handleDelete(false);
    } else {
      setDeleteOpen(true);
    }
  }
```

- [ ] **Step 3: Wire the button and dialog**

Change the Delete button (line 210):

```tsx
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>
```

to:

```tsx
        <Button variant="danger" onClick={handleDeleteClick}>Delete</Button>
```

And the `ConfirmDialog` (lines 223–230) to:

```tsx
      <ConfirmDialog
        open={deleteOpen}
        title="Delete session?"
        message="This cannot be undone."
        confirmLabel="Delete"
        showDontAskAgain
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck; npm test`
Expected: clean + green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/sessions/[id]/page.tsx"
git commit -m "feat: session delete don't-ask-again"
```

---

### Task 8: Label chips + LLM suggest in SessionForm

**Files:**
- Modify: `src/components/session/SessionForm.tsx`

**Interfaces:**
- Consumes: `buildLabelSuggestions` (Task 5); `suggestLabel({ note, llmSettings }: { note: string; llmSettings: LLMSettings; signal?: AbortSignal }): Promise<string>` from `@/lib/llm/llm-service`; `useSessions()` → `{ sessions }`; `useKataTemplates()` → `{ templates }`; `useLLMSettings()` → `{ settings: LLMSettings | undefined, configuredProviderNames: string[] }`; `dispatchToast(message: string, kind: 'success' | 'error')` from `@/components/ui/Toast`.

- [ ] **Step 1: Update imports**

In `src/components/session/SessionForm.tsx`, add:

```tsx
import { useMemo } from 'react'; // merge into the existing react import
import { Sparkles } from 'lucide-react';
import { useSessions } from '@/hooks/useSessions';
import { useKataTemplates } from '@/hooks/useKataTemplates';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { suggestLabel } from '@/lib/llm/llm-service';
import { buildLabelSuggestions } from '@/lib/utils/labels';
import { dispatchToast } from '@/components/ui/Toast';
```

(The first line of the file becomes: `import { useState, useEffect, useMemo } from 'react';`)

- [ ] **Step 2: Add hooks and suggestion state**

Inside `SessionForm(...)`, after the `useSettings()` line, add:

```tsx
  const { sessions } = useSessions();
  const { templates } = useKataTemplates();
  const { settings: llmSettings, configuredProviderNames } = useLLMSettings();
  const [suggesting, setSuggesting] = useState(false);
```

After the `note` state declaration, add:

```tsx
  const labelSuggestions = useMemo(
    () => buildLabelSuggestions(sessions, templates, activityLabel),
    [sessions, templates, activityLabel]
  );
  const canSuggest =
    note.trim().length > 0 && configuredProviderNames.length > 0 && !suggesting;
```

- [ ] **Step 3: Add the suggest handler**

Before `handleSubmit`, add:

```tsx
  async function handleSuggest() {
    if (!llmSettings || suggesting) return;
    setSuggesting(true);
    try {
      const label = await suggestLabel({ note, llmSettings });
      if (label) setActivityLabel(label.slice(0, 50));
    } catch (e) {
      dispatchToast(
        e instanceof Error ? e.message : 'Label suggestion failed',
        'error'
      );
    } finally {
      setSuggesting(false);
    }
  }
```

- [ ] **Step 4: Rework the label input JSX**

Replace the Activity label block:

```tsx
        {/* Activity label */}
        <div>
          <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Activity label (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. meditation, kata, deep work"
            value={activityLabel}
            onChange={(e) => setActivityLabel(e.target.value)}
            maxLength={50}
            className="w-full bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none"
          />
        </div>
```

with:

```tsx
        {/* Activity label */}
        <div>
          <label className="text-xs uppercase tracking-wide text-text-muted block mb-1">
            Activity label (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. meditation, kata, deep work"
              value={activityLabel}
              onChange={(e) => setActivityLabel(e.target.value)}
              maxLength={50}
              className="flex-1 bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSuggest()}
              disabled={!canSuggest}
              title={
                configuredProviderNames.length === 0
                  ? 'Configure an LLM provider to suggest labels'
                  : 'Suggest a label from your note'
              }
              aria-label="Suggest activity label"
              className="flex-shrink-0 w-10 rounded-xl bg-surface-2 border border-border text-text-muted hover:text-accent hover:border-accent/40 disabled:opacity-30 disabled:hover:text-text-muted disabled:hover:border-border transition-colors flex items-center justify-center"
            >
              <Sparkles size={15} className={suggesting ? 'animate-pulse' : ''} />
            </button>
          </div>
          {labelSuggestions.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {labelSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActivityLabel(s)}
                  className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-text-muted hover:text-text border border-border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck; npm test`
Expected: clean + green. Existing e2e targets the label input by placeholder/position — chips render *after* the input, so selectors stay valid.

- [ ] **Step 6: Commit**

```bash
git add src/components/session/SessionForm.tsx
git commit -m "feat: label chips + LLM suggest in session form"
```

---

### Task 9: Confirmations card + working Clear-all-data

**Files:**
- Create: `src/components/settings/ConfirmationSettings.tsx`
- Create: `src/components/settings/ClearDataSettings.tsx`
- Modify: `src/app/(main)/settings/page.tsx`

**Interfaces:**
- Consumes: confirmation flags (Task 1), `ConfirmDialog` with `showDontAskAgain` (Task 3), `useSettings()`, `getDb()` from `@/lib/db/db` (Dexie instance method `delete(): Promise<void>`).

- [ ] **Step 1: Create `src/components/settings/ConfirmationSettings.tsx`**

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';

export function ConfirmationSettings() {
  const { settings, updateSettings } = useSettings();

  const rows = [
    {
      label: 'Before deleting a kata',
      checked: settings?.confirmKataDelete ?? true,
      onChange: (v: boolean) => updateSettings({ confirmKataDelete: v }),
    },
    {
      label: 'Before deleting a session',
      checked: settings?.confirmSessionDelete ?? true,
      onChange: (v: boolean) => updateSettings({ confirmSessionDelete: v }),
    },
    {
      label: 'Before clearing all data',
      checked: settings?.confirmClearData ?? true,
      onChange: (v: boolean) => updateSettings({ confirmClearData: v }),
    },
  ];

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Confirmations
      </div>
      <div className="space-y-2.5">
        {rows.map(({ label, checked, onChange }) => (
          <label
            key={label}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="text-sm text-text">{label}</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => void onChange(e.target.checked)}
              className="accent-accent w-4 h-4"
            />
          </label>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Create `src/components/settings/ClearDataSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSettings } from '@/hooks/useSettings';
import { getDb } from '@/lib/db/db';

export function ClearDataSettings() {
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function wipe(): Promise<void> {
    setWiping(true);
    try {
      await getDb().delete();
    } finally {
      window.location.reload();
    }
  }

  function handleClick() {
    if (settings?.confirmClearData === false) {
      void wipe();
    } else {
      setOpen(true);
    }
  }

  async function handleConfirm(dontAskAgain: boolean) {
    if (dontAskAgain) await updateSettings({ confirmClearData: false });
    setOpen(false);
    await wipe();
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        Data
      </div>
      <Button variant="danger" onClick={handleClick} disabled={wiping}>
        {wiping ? 'Wiping…' : 'Clear all data'}
      </Button>
      <p className="text-text-muted text-xs mt-2">
        Wipes IndexedDB and reloads. Cannot be undone.
      </p>
      <ConfirmDialog
        open={open}
        title="Clear all data?"
        message="Every session, kata, conversation, and setting will be permanently deleted."
        confirmLabel="Wipe everything"
        showDontAskAgain
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Rewire the Settings page**

In `src/app/(main)/settings/page.tsx`:

Add imports (with the other component imports):

```tsx
import { ConfirmationSettings } from '@/components/settings/ConfirmationSettings';
import { ClearDataSettings } from '@/components/settings/ClearDataSettings';
```

Mount `<ConfirmationSettings />` directly after `<KataTemplateSettings />`, and replace the dead Data card:

```tsx
      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Data
        </div>
        <Button variant="danger">Clear all data</Button>
        <p className="text-text-muted text-xs mt-2">
          Wipes IndexedDB and reloads. Cannot be undone.
        </p>
      </Card>
```

with:

```tsx
      <ClearDataSettings />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck; npm test`
Expected: clean + green.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ConfirmationSettings.tsx src/components/settings/ClearDataSettings.tsx "src/app/(main)/settings/page.tsx"
git commit -m "feat: confirmation toggles setting + working clear-all-data"
```

---

### Task 10: README refresh + full verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–9.

- [ ] **Step 1: Replace the Status section**

In `README.md`, replace:

```markdown
## Status

**Wave 1: Foundation** — runnable PWA skeleton with local DB, schemas, repository layer, onboarding, and tab-bar shell. No business logic yet.
```

with:

```markdown
## Status

**Feature-complete through Wave 16** — the full practice loop ships: timed/reps sessions with 1–5 ratings and focus/energy/mood state, kata quick-start templates, a multi-provider AI coach (branching chat, daily briefing, weekly reflections), insights (rating trends, activity breakdown, heatmap, 365-day consistency matrix), habit goals with streak protection and rest days, Google Calendar export, themes, notifications, and JSON export/import. Local-first: all data lives in IndexedDB. Hardened with Vitest unit tests and Playwright e2e suites.
```

- [ ] **Step 2: Run the full gate**

Run: `npm run precommit`
Expected: typecheck clean, lint clean, all unit tests pass.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev` and at http://localhost:3000 verify:
1. Kata delete (Settings → Practice Katas) shows the confirm; ticking "Don't ask again" + Delete makes the next delete instant; the Confirmations toggle re-enables it.
2. Session delete on a session detail page behaves the same.
3. Clear all data wipes and reloads (confirm first run).
4. The kata icon picker shows the four categories; existing icons preselect correctly.
5. Session form shows recent-label chips; the sparkle button is disabled without a note/provider and suggests when both exist.
6. Escape closes each modal; the page behind doesn't scroll while a modal is open.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: refresh README status and features"
```
