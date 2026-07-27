# chrono-kata Wave 9: Theme System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add light/dark theme toggle + accent color picker. Three theme modes: `system` (follow OS), `light`, `dark`. Four accent colors: `amber` (default warm), `sage`, `magenta`, `cyan`. Persist user choice in Settings. Apply via CSS custom properties on `<html>` with a `data-theme` attribute + `data-accent` attribute.

**Architecture:** All theming via CSS variables. ThemeProvider component reads settings + OS preference, applies `data-theme` + `data-accent` attributes to `document.documentElement`. globals.css defines variable sets for each theme/accent combination. No JS color computation at runtime — pure CSS.

**Tech Stack:** Same as Waves 1–8. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`.
- **No FOUC (flash of unstyled content):** Theme must be applied before first paint. Use an inline script in `<head>` that reads localStorage + sets `data-theme` before React hydrates.
- **Backward compat:** Existing settings rows without `theme`/`accentColor` fields must parse. Default to `system` + `amber`.
- **CSS variables only:** No Tailwind dark: variant — use `:root[data-theme="light"]` selectors instead, so the theme system is framework-agnostic.
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.

---

## File Structure (Wave 9 additions)

```
src/
├── app/
│   ├── globals.css                           # MODIFY — add light theme + accent variants
│   └── layout.tsx                            # MODIFY — add no-FOUC inline script + ThemeScript
├── components/
│   ├── system/
│   │   ├── ThemeScript.tsx                   # NEW — inline pre-hydration script
│   │   └── ThemeApplier.tsx                  # NEW — syncs data-theme + data-accent from settings
│   └── settings/
│       └── ThemeSettings.tsx                 # NEW — mode + accent picker UI
├── lib/
│   └── schemas/
│       └── settings.ts                       # MODIFY — add theme + accentColor fields
tests/
└── unit/
    └── schemas/
        └── theme-migration.test.ts           # NEW — backward compat for new fields
```

---

## Task 1: Settings schema + CSS variables

**Files:**
- Modify: `src/lib/schemas/settings.ts`
- Modify: `src/app/globals.css`
- Create: `tests/unit/schemas/theme-migration.test.ts`

- [ ] **Step 1: Add fields to Settings schema**

Modify `src/lib/schemas/settings.ts`:

```typescript
export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const AccentColorSchema = z.enum(['amber', 'sage', 'magenta', 'cyan']);
export type AccentColor = z.infer<typeof AccentColorSchema>;

export const SettingsSchema = z.object({
  id: z.literal('singleton'),
  displayName: z.string().max(50).optional(),
  selectedCoachPersonality: CoachPersonalitySchema,
  unlockedPersonalities: z.array(CoachPersonalitySchema),
  googleCalendarId: z.string().nullable().optional(),
  googleCalendarSyncEnabled: z.boolean(),
  googleCalendarConnectedAt: z.date().nullable().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  theme: ThemeModeSchema.optional(),
  accentColor: AccentColorSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'> = {
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: null,
  googleCalendarSyncEnabled: false,
  googleCalendarConnectedAt: null,
  reminderTime: null,
  notificationsEnabled: false,
  theme: 'system',
  accentColor: 'amber',
};
```

- [ ] **Step 2: Write failing migration test**

Create `tests/unit/schemas/theme-migration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SettingsSchema } from '@/lib/schemas/settings';

describe('SettingsSchema — Wave 9 theme migration', () => {
  const preWave9 = {
    id: 'singleton' as const,
    selectedCoachPersonality: 'zen' as const,
    unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
    googleCalendarSyncEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('parses pre-Wave-9 rows (no theme, no accentColor)', () => {
    const result = SettingsSchema.safeParse(preWave9);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBeUndefined();
      expect(result.data.accentColor).toBeUndefined();
    }
  });

  it('accepts valid theme modes', () => {
    for (const t of ['system', 'light', 'dark'] as const) {
      const result = SettingsSchema.safeParse({ ...preWave9, theme: t });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid theme mode', () => {
    const result = SettingsSchema.safeParse({ ...preWave9, theme: 'purple' });
    expect(result.success).toBe(false);
  });

  it('accepts valid accent colors', () => {
    for (const a of ['amber', 'sage', 'magenta', 'cyan'] as const) {
      const result = SettingsSchema.safeParse({ ...preWave9, accentColor: a });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid accent color', () => {
    const result = SettingsSchema.safeParse({ ...preWave9, accentColor: 'pink' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Add light theme + accent CSS variables**

Replace `src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Fraunces', Georgia, serif;
}

/* ============================================================
   DARK THEME (default — matches Wave 1-8 design)
   ============================================================ */
:root,
:root[data-theme="dark"] {
  --color-base: #0f0e0c;
  --color-surface: #1a1816;
  --color-surface-2: #252220;
  --color-text: #f5f0e8;
  --color-text-muted: #a89e94;
  --color-border: #2d2925;
}

/* ============================================================
   LIGHT THEME
   ============================================================ */
:root[data-theme="light"] {
  --color-base: #faf8f5;
  --color-surface: #ffffff;
  --color-surface-2: #f0ede8;
  --color-text: #1a1816;
  --color-text-muted: #6b635a;
  --color-border: #e0dad2;
}

/* ============================================================
   ACCENT COLORS (independent of light/dark)
   ============================================================ */
:root[data-accent="amber"],
:root {
  --color-accent: #f5a623;
  --color-accent-hover: #ffb84d;
}
:root[data-accent="sage"] {
  --color-accent: #7ba668;
  --color-accent-hover: #8db97a;
}
:root[data-accent="magenta"] {
  --color-accent: #d94977;
  --color-accent-hover: #e85d8a;
}
:root[data-accent="cyan"] {
  --color-accent: #4ba3c7;
  --color-accent-hover: #5fb5d8;
}

/* Personality colors stay constant across themes */
:root {
  --color-zen: #9caf88;
  --color-hype: #e85d75;
  --color-analyst: #6bb7d9;
  --color-buddy: #f5a623;
  --color-athena-from: #b39ddb;
  --color-athena-to: #e6c99a;
}

/* ============================================================
   System preference — apply dark when system prefers dark
   AND no explicit data-theme is set
   ============================================================ */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-base: #0f0e0c;
    --color-surface: #1a1816;
    --color-surface-2: #252220;
    --color-text: #f5f0e8;
    --color-text-muted: #a89e94;
    --color-border: #2d2925;
  }
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --color-base: #faf8f5;
    --color-surface: #ffffff;
    --color-surface-2: #f0ede8;
    --color-text: #1a1816;
    --color-text-muted: #6b635a;
    --color-border: #e0dad2;
  }
}

html, body {
  background-color: var(--color-base);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.2s ease, color 0.2s ease;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
}
```

- [ ] **Step 4: Run migration test**

Run: `npm test -- theme-migration`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: theme schema + light/dark CSS variables + accent variants" }
```

---

## Task 2: ThemeScript (no-FOUC) + ThemeApplier

**Files:**
- Create: `src/components/system/ThemeScript.tsx`
- Create: `src/components/system/ThemeApplier.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: ThemeScript (inline pre-hydration)**

Create `src/components/system/ThemeScript.tsx`:

```tsx
/**
 * Inline script that runs BEFORE React hydration to set data-theme and
 * data-accent on <html>, preventing FOUC. Reads from localStorage
 * (the settings mirror) — the ThemeApplier component syncs settings →
 * localStorage once React mounts.
 *
 * Rendered via Next.js <Script strategy="beforeInteractive" /> OR
 * directly in <head> as dangerouslySetInnerHTML.
 */
export const THEME_INLINE_SCRIPT = `
(function() {
  try {
    var raw = localStorage.getItem('chrono-kata-theme');
    var parsed = raw ? JSON.parse(raw) : {};
    var theme = parsed.theme || 'system';
    var accent = parsed.accent || 'amber';
    if (theme === 'system') {
      // Don't set data-theme; let @media prefers-color-scheme handle it.
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-accent', accent);
  } catch (e) {
    // Defaults are fine — dark via :root, amber via :root[data-accent="amber"].
  }
})();
`;
```

- [ ] **Step 2: ThemeApplier component**

Create `src/components/system/ThemeApplier.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

/**
 * Syncs the user's theme + accent preferences from settings to:
 * 1. `data-theme` attribute on <html> (drives CSS variable selection)
 * 2. `data-accent` attribute on <html> (drives accent color)
 * 3. `localStorage['chrono-kata-theme']` (so ThemeScript can read it
 *    before React hydrates on next page load → no FOUC)
 */
export function ThemeApplier() {
  const { settings } = useSettings();

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const accent = settings?.accentColor ?? 'amber';

    // Apply to <html>.
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-accent', accent);

    // Mirror to localStorage for ThemeScript.
    try {
      localStorage.setItem('chrono-kata-theme', JSON.stringify({ theme, accent }));
    } catch {
      // localStorage unavailable (private mode etc.) — theme still works
      // for this session, just won't survive reload without FOUC.
    }
  }, [settings?.theme, settings?.accentColor]);

  return null;
}
```

- [ ] **Step 3: Wire into root layout**

Modify `src/app/layout.tsx`:

Add imports:
```tsx
import { THEME_INLINE_SCRIPT } from '@/components/system/ThemeScript';
import { ThemeApplier } from '@/components/system/ThemeApplier';
```

In the `<head>` section (or before `<body>` content), add the inline script:
```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
</head>
```

Inside `<body>`, add `<ThemeApplier />` alongside the existing `<QueryProvider>` + `<ToastProvider>`:
```tsx
<body>
  <QueryProvider>
    <ToastProvider>
      <ThemeApplier />
      {children}
    </ToastProvider>
  </QueryProvider>
</body>
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: ThemeScript no-FOUC + ThemeApplier component" }
```

---

## Task 3: ThemeSettings UI

**Files:**
- Create: `src/components/settings/ThemeSettings.tsx`
- Modify: `src/app/(main)/settings/page.tsx`

- [ ] **Step 1: ThemeSettings component**

Create `src/components/settings/ThemeSettings.tsx`:

```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';
import type { ThemeMode, AccentColor } from '@/lib/schemas/settings';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: 'amber', label: 'Amber', color: '#f5a623' },
  { value: 'sage', label: 'Sage', color: '#7ba668' },
  { value: 'magenta', label: 'Magenta', color: '#d94977' },
  { value: 'cyan', label: 'Cyan', color: '#4ba3c7' },
];

export function ThemeSettings() {
  const { settings, updateSettings } = useSettings();
  const currentTheme = settings?.theme ?? 'system';
  const currentAccent = settings?.accentColor ?? 'amber';

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Appearance
      </div>

      {/* Theme mode */}
      <div className="mb-4">
        <div className="text-sm text-text mb-2">Theme</div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = currentTheme === value;
            return (
              <button
                key={value}
                onClick={() => updateSettings({ theme: value })}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-2 text-text-muted'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent color */}
      <div>
        <div className="text-sm text-text mb-2">Accent color</div>
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_OPTIONS.map(({ value, label, color }) => {
            const active = currentAccent === value;
            return (
              <button
                key={value}
                onClick={() => updateSettings({ accentColor: value })}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                  active ? 'border-accent' : 'border-border bg-surface-2'
                }`}
              >
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className={`text-xs ${active ? 'text-accent' : 'text-text-muted'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add to Settings page**

Modify `src/app/(main)/settings/page.tsx`:

Add import:
```tsx
import { ThemeSettings } from '@/components/settings/ThemeSettings';
```

Include `<ThemeSettings />` near the top of the settings cards (before Calendar/Reminder/Data).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: theme settings UI - mode picker + accent color picker" }
```

---

## Task 4: Final Wave 9 verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 131 prior + 6 new = 137 tests pass.

- [ ] **Step 2: Run typecheck + build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 9 final verification" } }
```

---

## Wave 9 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — 137+ tests pass
- [ ] `npm run build` succeeds
- [ ] Settings page shows "Appearance" card with theme + accent picker
- [ ] Selecting "Light" immediately switches to light theme (white background, dark text)
- [ ] Selecting "Dark" immediately switches back to dark theme
- [ ] Selecting "System" follows OS preference
- [ ] Selecting a different accent color (sage/magenta/cyan) immediately changes buttons/links/flame
- [ ] Theme persists across page reloads (via localStorage mirror + ThemeScript)
- [ ] No FOUC on page load (inline script sets data-theme before React hydrates)
- [ ] Pre-Wave-9 settings rows parse without error
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source