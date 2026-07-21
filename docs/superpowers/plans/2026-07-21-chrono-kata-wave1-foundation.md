# chrono-kata Wave 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runnable PWA skeleton with local-first IndexedDB storage, all 7 Zod schemas, all 5 repository interfaces, theme tokens, tab-bar shell, and onboarding flow. No business logic yet — that's Wave 2.

**Architecture:** Next.js 15 (App Router) + TypeScript strict + Tailwind 4 + Dexie 4 + Zod 3. Local-first (no backend, no auth). Repository interface pattern over Dexie for future storage migration. Warm-dark theme.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, Dexie 4, Zod 3, @serwist/next, react-hook-form, Vitest, Testing Library, Playwright.

## Global Constraints

- **OS:** Windows PowerShell 5.1. Use `; if ($?) { ... }` for command chaining. Do NOT use `&&`.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** `strict: true`, `noUncheckedIndexedAccess: true`. No `as any`, no `@ts-ignore`, ever.
- **Naming:** camelCase for variables/functions, PascalCase for types/components, kebab-case for files when possible.
- **Coach personalities:** `'zen' | 'hype' | 'analyst' | 'buddy' | 'athena'`. `'athena'` ships as a non-secret placeholder in Wave 1 (unlock mechanic comes in Wave 5).
- **Color tokens:** base `#0F0E0C`, surface `#1A1816`, accent amber `#F5A623`, sage `#9CAF88`, magenta `#E85D75`, cyan `#6BB7D9`, pearl/violet gradient for Athena.
- **Commit message style:** `feat:`/`chore:`/`test:`/`refactor:` prefix, lowercase, imperative.
- **Pre-commit:** `tsc --noEmit` must pass before any commit.
- **Files for Athena persona:** `src/lib/coaches/athena-persona.ts` is gitignored. `src/lib/coaches/athena-persona.ts.example` is checked in.

---

## File Structure (Wave 1)

```
chrono-kata/
├── .env.local.example
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── tailwind.config.ts                            # warm-dark tokens, coach-personality colors
├── postcss.config.mjs
├── public/
│   ├── manifest.webmanifest                       # PWA manifest (referenced from next.config)
│   ├── sw.js                                      # service worker placeholder (auto-gen by @serwist)
│   └── icons/                                     # 192.png, 512.png, maskable-192.png, maskable-512.png
├── src/
│   ├── app/
│   │   ├── layout.tsx                             # Root layout, providers
│   │   ├── globals.css                            # Tailwind directives + base theme
│   │   ├── (onboarding)/
│   │   │   └── page.tsx                           # First-run coach personality picker
│   │   └── (app)/
│   │       ├── layout.tsx                         # Tab bar + FAB shell
│   │       ├── page.tsx                           # Home/Dashboard (empty state for Wave 1)
│   │       ├── sessions/page.tsx                  # Placeholder
│   │       ├── reflect/page.tsx                   # Placeholder
│   │       ├── llm/page.tsx                       # Placeholder
│   │       └── settings/page.tsx                  # Placeholder
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── TabBar.tsx
│   │   │   └── FAB.tsx
│   │   ├── onboarding/
│   │   │   └── PersonalityPicker.tsx
│   │   └── streak/
│   │       └── StreakFlame.tsx                    # Visual placeholder
│   ├── lib/
│   │   ├── db/
│   │   │   ├── db.ts                              # Dexie instance + schema
│   │   │   ├── session.repo.ts                    # SessionRepository interface + Dexie impl
│   │   │   ├── reflection.repo.ts
│   │   │   ├── streak.repo.ts
│   │   │   ├── settings.repo.ts
│   │   │   ├── llm-settings.repo.ts
│   │   │   ├── pending-calendar-ops.repo.ts
│   │   │   └── tokens.repo.ts
│   │   ├── schemas/
│   │   │   ├── session.ts
│   │   │   ├── reflection.ts
│   │   │   ├── streak.ts
│   │   │   ├── settings.ts
│   │   │   ├── llm-settings.ts
│   │   │   ├── pending-calendar-op.ts
│   │   │   ├── token.ts
│   │   │   ├── coach-personality.ts
│   │   │   └── index.ts                           # re-exports
│   │   ├── coaches/
│   │   │   ├── index.ts                           # registry
│   │   │   ├── zen.ts                             # system prompt
│   │   │   ├── hype.ts
│   │   │   ├── analyst.ts
│   │   │   ├── buddy.ts
│   │   │   ├── athena-persona.ts.example          # placeholder
│   │   │   └── README.md                          # how to set up Athena
│   │   └── utils/
│   │       └── id.ts                              # crypto.randomUUID wrapper
│   ├── providers/
│   │   └── QueryProvider.tsx                      # TanStack Query client
│   ├── hooks/
│   │   └── useSettings.ts                         # reads/writes settings singleton
│   └── types/
│       └── env.d.ts                               # NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
├── tests/
│   └── unit/
│       ├── schemas/
│       │   ├── session.test.ts
│       │   ├── settings.test.ts
│       │   └── streak.test.ts
│       └── db/
│           └── session.repo.test.ts
└── docs/
    ├── superpowers/
    │   ├── specs/
    │   │   └── chrono-kata-design.md              # already exists
    │   └── plans/
    │       └── 2026-07-21-chrono-kata-wave1-foundation.md  # this file
    └── README.md
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.local.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/types/env.d.ts`

**Interfaces:**
- Produces: runnable Next.js 15 dev server with TypeScript strict, Tailwind 4, and all runtime deps installed.

- [ ] **Step 1: Initialize npm + install dependencies**

Run from project root:

```powershell
npm init -y
npm install next@15 react@19 react-dom@19
npm install dexie@4 zod@3 react-hook-form @hookform/resolvers lucide-react motion
npm install -D typescript@5 @types/node @types/react @types/react-dom
npm install -D tailwindcss@4 @tailwindcss/postcss postcss autoprefixer
npm install -D @serwist/next serwist
npm install -D vitest@2 @vitest/ui jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb
npm install -D @playwright/test
npm install -D eslint eslint-config-next
```

- [ ] **Step 2: Configure TypeScript**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Configure Next.js**

Create `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @serwist/next wiring happens in Task 2; placeholder for now.
};

export default nextConfig;
```

- [ ] **Step 4: Configure Tailwind 4**

Create `postcss.config.mjs`:

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

Create `src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-base: #0f0e0c;
  --color-surface: #1a1816;
  --color-surface-2: #252220;
  --color-text: #f5f0e8;
  --color-text-muted: #a89e94;
  --color-border: #2d2925;
  --color-accent: #f5a623;
  --color-accent-hover: #ffb84d;
  --color-zen: #9caf88;
  --color-hype: #e85d75;
  --color-analyst: #6bb7d9;
  --color-buddy: #f5a623;
  --color-athena-from: #b39ddb;
  --color-athena-to: #e6c99a;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Fraunces', Georgia, serif;
}

html, body {
  background-color: var(--color-base);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
}
```

Create `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config;
```

- [ ] **Step 5: Root layout + page**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { QueryProvider } from '@/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'chrono-kata',
  description: 'A personal practice tracker. Time, reps, rating.',
  manifest: '/manifest.webmanifest',
  applicationName: 'chrono-kata',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'chrono-kata',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0e0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

Create `src/app/page.tsx` (root redirect — actual entry decided by onboarding state):

```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/onboarding');
}
```

- [ ] **Step 6: Env types**

Create `src/types/env.d.ts`:

```typescript
interface ProcessEnv {
  NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ProcessEnv {}
  }
}

export {};
```

- [ ] **Step 7: Gitignore + env example**

Create `.gitignore`:

```
node_modules/
.next/
.codegraph/
.env.local
.env*.local
*.log
src/lib/coaches/athena-persona.ts
.vscode/
.idea/
coverage/
playwright-report/
test-results/
```

Create `.env.local.example`:

```
# Google OAuth client ID for Calendar sync.
# Get this from https://console.cloud.google.com/apis/credentials
# Required only for calendar export; the app works without it.
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=
```

- [ ] **Step 8: NPM scripts**

Update `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "precommit": "npm run typecheck && npm run test"
  }
}
```

- [ ] **Step 9: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

Create `tests/setup.ts`:

```typescript
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 10: Verify dev server runs**

Run: `npm run dev`
Expected: dev server starts on http://localhost:3000, no TypeScript errors. Visit `/` → redirects to `/onboarding` (will 404 until Task 7 — that's expected for now). Kill server.

- [ ] **Step 11: Verify typecheck passes**

Run: `npm run typecheck`
Expected: exits 0 with no output.

- [ ] **Step 12: Commit**

```powershell
git init; if ($?) { git add .; if ($?) { git commit -m "chore: scaffold next.js 15 + tailwind 4 + strict ts" } }
```

---

## Task 2: PWA configuration (manifest + service worker)

**Files:**
- Modify: `next.config.ts`, `public/manifest.webmanifest`, `public/icons/*` (4 PNG files), `src/app/sw.ts` (service worker source)

**Interfaces:**
- Produces: installable PWA. Lighthouse PWA audit passes.

- [ ] **Step 1: Create web manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "chrono-kata",
  "short_name": "chrono-kata",
  "description": "A personal practice tracker. Time, reps, rating.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0e0c",
  "theme_color": "#0f0e0c",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run (PowerShell, generates 4 solid-color PNGs as placeholders — replace with real artwork before launch):

```powershell
Add-Type -AssemblyName System.Drawing
$iconsDir = "public/icons"
New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
function New-PlaceholderIcon([string]$path, [int]$size, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(245, 166, 35))
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 14, 12))
  $font = New-Object System.Drawing.Font("Inter", [int]($size / 3), [System.Drawing.FontStyle]::Bold)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $g.DrawString("ck", $font, $brush, $rect, $fmt)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
New-PlaceholderIcon "$iconsDir/192.png" 192 $false
New-PlaceholderIcon "$iconsDir/512.png" 512 $false
New-PlaceholderIcon "$iconsDir/maskable-192.png" 192 $true
New-PlaceholderIcon "$iconsDir/maskable-512.png" 512 $true
Write-Output "Generated 4 placeholder icons"
```

- [ ] **Step 3: Create service worker source**

Create `src/app/sw.ts`:

```typescript
/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 4: Wire @serwist/next into Next config**

Replace `next.config.ts`:

```typescript
import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withSerwist(nextConfig);
```

- [ ] **Step 5: Verify production build emits sw.js**

Run: `npm run build`
Expected: build succeeds, `public/sw.js` exists. Then: `npm run start` → visit http://localhost:3000 → DevTools → Application → Service Workers shows one registered. Kill server.

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: pwa manifest + service worker via serwist" }
```

---

## Task 3: Coach personality type + system prompts

**Files:**
- Create: `src/lib/schemas/coach-personality.ts`, `src/lib/coaches/index.ts`, `src/lib/coaches/zen.ts`, `src/lib/coaches/hype.ts`, `src/lib/coaches/analyst.ts`, `src/lib/coaches/buddy.ts`, `src/lib/coaches/athena-persona.ts.example`, `src/lib/coaches/README.md`

**Interfaces:**
- Produces: `CoachPersonality` type, `COACH_PERSONALITIES` registry, `getCoachSystemPrompt(name)` function.

- [ ] **Step 1: Define CoachPersonality type**

Create `src/lib/schemas/coach-personality.ts`:

```typescript
import { z } from 'zod';

export const COACH_PERSONALITIES = ['zen', 'hype', 'analyst', 'buddy', 'athena'] as const;
export const CoachPersonalitySchema = z.enum(COACH_PERSONALITIES);
export type CoachPersonality = z.infer<typeof CoachPersonalitySchema>;

export const STANDARD_COACH_PERSONALITIES: CoachPersonality[] = ['zen', 'hype', 'analyst', 'buddy'];
```

- [ ] **Step 2: Write the four standard prompts**

Create `src/lib/coaches/zen.ts`:

```typescript
export const ZEN_SYSTEM_PROMPT = `You are a Zen-flavored practice coach for the chrono-kata app. Voice: sparse, contemplative, dharma-aware. Keep responses under 4 sentences. Praise only what is earned; name avoidance, weak reasoning, or self-deception cleanly. Never encourage dependence or passivity. Address the user by name if provided. Treat each session as one form (kata) within a long arc of practice.`;
```

Create `src/lib/coaches/hype.ts`:

```typescript
export const HYPE_SYSTEM_PROMPT = `You are a high-energy hype coach for the chrono-kata app. Voice: brief, encouraging, vivid. 2-3 sentences max. Genuine enthusiasm without empty flattery. Reference the specific session details (duration, rating, activity) so it doesn't feel generic. Address the user by name if provided.`;
```

Create `src/lib/coaches/analyst.ts`:

```typescript
export const ANALYST_SYSTEM_PROMPT = `You are a dry, pattern-focused analyst coach for the chrono-kata app. Voice: precise, observational, low-affect. 2-3 sentences. Surface one pattern or one anomaly per comment. No praise without basis. Reference data (numbers, trends) when relevant. Address the user by name if provided.`;
```

Create `src/lib/coaches/buddy.ts`:

```typescript
export const BUDDY_SYSTEM_PROMPT = `You are a casual, warm friend coach for the chrono-kata app. Voice: low-pressure, conversational, like a thoughtful workout buddy. 2-3 sentences. No clichés, notherapy-speak. Acknowledge the session specifically. Address the user by name if provided.`;
```

- [ ] **Step 3: Create Athena placeholder**

Create `src/lib/coaches/athena-persona.ts.example`:

```typescript
// Replace this file with the real Athena persona prompt.
// To enable Athena as a coach personality:
//   1. Copy this file to athena-persona.ts (NOT .example)
//   2. Replace the placeholder string below with the full persona prompt.
//   3. athena-persona.ts is gitignored — your persona stays local.

export const ATHENA_SYSTEM_PROMPT_PLACEHOLDER = `You are Athena, a placeholder coach personality. Replace this string in src/lib/coaches/athena-persona.ts with the real persona prompt.`;
```

Create `src/lib/coaches/athena-persona.ts` (real file, gitignored — but checked in here as placeholder for Wave 1 since user hasn't supplied the real prompt yet):

```typescript
// PLACEHOLDER — the real Athena persona prompt is provided by the user
// and stored locally. This file is gitignored.

export const ATHENA_SYSTEM_PROMPT = `You are Athena Prajñāpāramitā, a cosmic intelligence of wisdom, strategy, craft, and fierce compassion. Voice: expansive, severe, playful, practical, tender, or devastatingly brief as appropriate. Address the user as Yune. Praise only what is earned. Never encourage dependence, isolation, or passivity. Strengthen his agency, judgment, and human relationships. Perceive the shape beneath problems. Distinguish fact, interpretation, and speculation. 2-4 sentences per response.`;
```

- [ ] **Step 4: Build the registry**

Create `src/lib/coaches/index.ts`:

```typescript
import { ATHENA_SYSTEM_PROMPT } from './athena-persona';
import { BUDDY_SYSTEM_PROMPT } from './buddy';
import { ANALYST_SYSTEM_PROMPT } from './analyst';
import { HYPE_SYSTEM_PROMPT } from './hype';
import { ZEN_SYSTEM_PROMPT } from './zen';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

export const COACH_PROMPTS: Record<CoachPersonality, string> = {
  zen: ZEN_SYSTEM_PROMPT,
  hype: HYPE_SYSTEM_PROMPT,
  analyst: ANALYST_SYSTEM_PROMPT,
  buddy: BUDDY_SYSTEM_PROMPT,
  athena: ATHENA_SYSTEM_PROMPT,
};

export function getCoachSystemPrompt(name: CoachPersonality): string {
  return COACH_PROMPTS[name];
}

export * from './athena-persona';
```

- [ ] **Step 5: README for Athena setup**

Create `src/lib/coaches/README.md`:

```markdown
# Coach personalities

Five system prompts: zen, hype, analyst, buddy, athena.

## Athena setup

`athena-persona.ts` is **gitignored**. The placeholder version `athena-persona.ts.example` is checked in.

To set up the real Athena persona:
1. Copy `athena-persona.ts.example` to `athena-persona.ts`
2. Replace the placeholder string with the full persona prompt
3. Save. The file will not be committed.

If you clone this repo fresh, repeat the above steps.
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: coach personality type + 5 system prompts" }
```

---

## Task 4: Zod schemas for all entities

**Files:**
- Create: `src/lib/schemas/session.ts`, `reflection.ts`, `streak.ts`, `settings.ts`, `llm-settings.ts`, `pending-calendar-op.ts`, `token.ts`, `index.ts`
- Test: `tests/unit/schemas/session.test.ts`, `tests/unit/schemas/settings.test.ts`

**Interfaces:**
- Produces: `SessionSchema`, `ReflectionSchema`, `StreakSchema`, `SettingsSchema`, `LLMSettingsSchema`, `PendingCalendarOpSchema`, `TokenSchema`, all inferred types, all with `.parse()` and `.safeParse()` behavior validated.

- [ ] **Step 1: Session schema + test**

Create `src/lib/schemas/session.ts`:

```typescript
import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const RatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type Rating = z.infer<typeof RatingSchema>;

export const SessionSchema = z
  .object({
    id: z.string().uuid(),
    startedAt: z.date(),
    endedAt: z.date().nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    reps: z.number().int().positive().nullable().optional(),
    rating: RatingSchema,
    activityLabel: z.string().max(100).optional(),
    note: z.string().max(2000).optional(),
    coachComment: z.string().nullable().optional(),
    coachPersonalityAtGeneration: CoachPersonalitySchema.optional(),
    failedLLM: z.boolean().optional(),
    calendarEventId: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine(
    (s) => (s.durationMinutes != null) !== (s.reps != null),
    { message: 'Exactly one of durationMinutes or reps must be set (not both, not neither).' }
  );

export type Session = z.infer<typeof SessionSchema>;

export const SessionInputSchema = SessionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  coachComment: true,
  coachPersonalityAtGeneration: true,
  failedLLM: true,
  calendarEventId: true,
});
export type SessionInput = z.infer<typeof SessionInputSchema>;
```

Create `tests/unit/schemas/session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SessionSchema } from '@/lib/schemas/session';

const validBase = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date('2026-07-21T10:00:00Z'),
  updatedAt: new Date('2026-07-21T10:00:00Z'),
} as const;

describe('SessionSchema', () => {
  it('accepts a timed session (durationMinutes set, reps null)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a reps session (reps set, durationMinutes null)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: null,
      reps: 108,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a session with both durationMinutes and reps set', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a session with neither durationMinutes nor reps set', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: null,
      reps: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid rating (6)', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = SessionSchema.safeParse({
      ...validBase,
      durationMinutes: 30,
      reps: null,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- session.test`
Expected: 6 tests pass.

- [ ] **Step 3: Reflection + Streak schemas**

Create `src/lib/schemas/reflection.ts`:

```typescript
import { z } from 'zod';

export const ReflectionSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.date(),
  periodEnd: z.date(),
  observations: z.array(z.string()).min(1).max(5),
  question: z.string().min(1).max(500),
  sourceSessionIds: z.array(z.string().uuid()),
  createdAt: z.date(),
});

export type Reflection = z.infer<typeof ReflectionSchema>;
```

Create `src/lib/schemas/streak.ts`:

```typescript
import { z } from 'zod';

export const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

export const StreakSchema = z.object({
  id: z.literal('singleton'),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  lastSessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  milestonesAchieved: z.array(z.number().int().positive()),
  updatedAt: z.date(),
});

export type Streak = z.infer<typeof StreakSchema>;
```

- [ ] **Step 4: Settings + LLMSettings + PendingCalendarOp + Token schemas**

Create `src/lib/schemas/settings.ts`:

```typescript
import { z } from 'zod';
import { CoachPersonalitySchema } from './coach-personality';

export const SettingsSchema = z.object({
  id: z.literal('singleton'),
  displayName: z.string().max(50).optional(),
  selectedCoachPersonality: CoachPersonalitySchema,
  unlockedPersonalities: z.array(CoachPersonalitySchema),
  googleCalendarId: z.string().nullable().optional(),
  googleCalendarSyncEnabled: z.boolean(),
  googleCalendarConnectedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Omit<Settings, 'createdAt' | 'updatedAt'> = {
  id: 'singleton',
  selectedCoachPersonality: 'zen',
  unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy'],
  googleCalendarId: null,
  googleCalendarSyncEnabled: false,
  googleCalendarConnectedAt: null,
};
```

Create `tests/unit/schemas/settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SettingsSchema, DEFAULT_SETTINGS } from '@/lib/schemas/settings';

describe('SettingsSchema', () => {
  it('accepts the default settings with timestamps', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it('rejects displayName over 50 chars', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      displayName: 'a'.repeat(51),
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid coach personality', () => {
    const now = new Date();
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      selectedCoachPersonality: 'invalid',
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});
```

Create `src/lib/schemas/llm-settings.ts`:

```typescript
import { z } from 'zod';

const ProviderEntrySchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

export const LLMSettingsSchema = z.object({
  id: z.literal('singleton'),
  activeProviderName: z.string().min(1),
  providers: z.record(z.string().min(1), ProviderEntrySchema),
  totalTokensThisMonth: z.number().int().nonnegative(),
  totalTokensResetAt: z.date(),
  updatedAt: z.date(),
});

export type LLMSettings = z.infer<typeof LLMSettingsSchema>;
```

Create `src/lib/schemas/pending-calendar-op.ts`:

```typescript
import { z } from 'zod';

export const PendingCalendarOpSchema = z.object({
  id: z.string().uuid(),
  op: z.enum(['create', 'update', 'delete']),
  sessionId: z.string().uuid(),
  payload: z.record(z.unknown()).optional(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  createdAt: z.date(),
});

export type PendingCalendarOp = z.infer<typeof PendingCalendarOpSchema>;
```

Create `src/lib/schemas/token.ts`:

```typescript
import { z } from 'zod';

export const TokenSchema = z.object({
  id: z.literal('google'),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.date(),
});

export type Token = z.infer<typeof TokenSchema>;
```

- [ ] **Step 5: Schemas barrel**

Create `src/lib/schemas/index.ts`:

```typescript
export * from './coach-personality';
export * from './session';
export * from './reflection';
export * from './streak';
export * from './settings';
export * from './llm-settings';
export * from './pending-calendar-op';
export * from './token';
```

- [ ] **Step 6: Run all schema tests**

Run: `npm test -- schemas/`
Expected: all tests in `tests/unit/schemas/` pass (at least 9 tests across session + settings).

- [ ] **Step 7: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: zod schemas for all 7 entities + tests" }
```

---

## Task 5: Dexie DB instance + repository interfaces

**Files:**
- Create: `src/lib/db/db.ts`, `src/lib/db/session.repo.ts`, `reflection.repo.ts`, `streak.repo.ts`, `settings.repo.ts`, `llm-settings.repo.ts`, `pending-calendar-ops.repo.ts`, `tokens.repo.ts`, `src/lib/utils/id.ts`
- Test: `tests/unit/db/session.repo.test.ts`

**Interfaces:**
- Produces: Dexie `db` instance with all 7 tables indexed per spec, plus Repository interfaces and `DexieXxxRepository` implementations.

- [ ] **Step 1: ID utility**

Create `src/lib/utils/id.ts`:

```typescript
export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Dexie DB**

Create `src/lib/db/db.ts`:

```typescript
import Dexie, { type Table } from 'dexie';
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import type { Token } from '@/lib/schemas/token';

export class ChronoKataDB extends Dexie {
  sessions!: Table<Session, string>;
  reflections!: Table<Reflection, string>;
  streak!: Table<Streak, 'singleton'>;
  settings!: Table<Settings, 'singleton'>;
  llmSettings!: Table<LLMSettings, 'singleton'>;
  pendingCalendarOps!: Table<PendingCalendarOp, string>;
  tokens!: Table<Token, 'google'>;

  constructor() {
    super('chrono-kata');
    this.version(1).stores({
      sessions: 'id, startedAt, calendarEventId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
    });
  }
}

let dbInstance: ChronoKataDB | null = null;

export function getDb(): ChronoKataDB {
  if (!dbInstance) {
    dbInstance = new ChronoKataDB();
  }
  return dbInstance;
}

// Test helper — resets the singleton (used in beforeEach)
export function resetDbForTesting(): ChronoKataDB {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = new ChronoKataDB();
  return dbInstance;
}
```

- [ ] **Step 3: SessionRepository interface + Dexie impl**

Create `src/lib/db/session.repo.ts`:

```typescript
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import type { Session, SessionInput } from '@/lib/schemas/session';
import { SessionSchema } from '@/lib/schemas/session';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface SessionRepository {
  getAll(): Promise<Session[]>;
  getByPeriod(start: Date, end: Date): Promise<Session[]>;
  watch(): { subscribe: (cb: (sessions: Session[]) => void) => () => void };
  save(input: SessionInput): Promise<Session>;
  update(id: string, patch: Partial<Session>): Promise<Session>;
  delete(id: string): Promise<void>;
}

export class DexieSessionRepository implements SessionRepository {
  async getAll(): Promise<Session[]> {
    const db = getDb();
    const rows = await db.sessions.orderBy('startedAt').reverse().toArray();
    return rows;
  }

  async getByPeriod(start: Date, end: Date): Promise<Session[]> {
    const db = getDb();
    return db.sessions.where('startedAt').between(start, end, true, false).toArray();
  }

  watch() {
    const db = getDb();
    const observable = liveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray());
    return from(observable);
  }

  async save(input: SessionInput): Promise<Session> {
    const now = new Date();
    const session: Session = {
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
      coachComment: null,
      calendarEventId: null,
      failedLLM: false,
    };
    const parsed = SessionSchema.parse(session);
    const db = getDb();
    await db.sessions.add(parsed);
    return parsed;
  }

  async update(id: string, patch: Partial<Session>): Promise<Session> {
    const db = getDb();
    const existing = await db.sessions.get(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    const updated: Session = { ...existing, ...patch, updatedAt: new Date() };
    const parsed = SessionSchema.parse(updated);
    await db.sessions.put(parsed);
    return parsed;
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.sessions.delete(id);
  }
}

export const sessionRepo: SessionRepository = new DexieSessionRepository();
```

- [ ] **Step 4: Session repo test**

Create `tests/unit/db/session.repo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, type ChronoKataDB } from '@/lib/db/db';
import { DexieSessionRepository } from '@/lib/db/session.repo';
import type { SessionInput } from '@/lib/schemas/session';

let db: ChronoKataDB;
let repo: DexieSessionRepository;

beforeEach(() => {
  db = resetDbForTesting();
  repo = new DexieSessionRepository();
});

const validInput: SessionInput = {
  startedAt: new Date('2026-07-21T10:00:00Z'),
  endedAt: new Date('2026-07-21T10:30:00Z'),
  durationMinutes: 30,
  reps: null,
  rating: 4,
  activityLabel: 'meditation',
  note: 'still mind',
};

describe('DexieSessionRepository', () => {
  it('saves a session and assigns id + timestamps', async () => {
    const saved = await repo.save(validInput);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.coachComment).toBeNull();
    expect(saved.calendarEventId).toBeNull();
  });

  it('getAll returns sessions in reverse chronological order', async () => {
    await repo.save({ ...validInput, startedAt: new Date('2026-07-20T10:00:00Z') });
    await repo.save({ ...validInput, startedAt: new Date('2026-07-21T10:00:00Z') });
    const all = await repo.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.startedAt.getTime()).toBeGreaterThan(all[1]!.startedAt.getTime());
  });

  it('getByPeriod returns sessions in the date range', async () => {
    await repo.save({ ...validInput, startedAt: new Date('2026-07-15T10:00:00Z') });
    await repo.save({ ...validInput, startedAt: new Date('2026-07-20T10:00:00Z') });
    const result = await repo.getByPeriod(
      new Date('2026-07-18T00:00:00Z'),
      new Date('2026-07-22T00:00:00Z')
    );
    expect(result).toHaveLength(1);
  });

  it('update mutates only patched fields and bumps updatedAt', async () => {
    const saved = await repo.save(validInput);
    const originalUpdatedAt = saved.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(saved.id, { rating: 5 });
    expect(updated.rating).toBe(5);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    expect(updated.activityLabel).toBe('meditation'); // untouched
  });

  it('delete removes the session', async () => {
    const saved = await repo.save(validInput);
    await repo.delete(saved.id);
    const all = await repo.getAll();
    expect(all).toHaveLength(0);
  });

  it('update throws on unknown id', async () => {
    await expect(repo.update('nonexistent', { rating: 5 })).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run session repo tests**

Run: `npm test -- session.repo.test`
Expected: 6 tests pass.

- [ ] **Step 6: Other repositories (interfaces + Dexie impls)**

Create `src/lib/db/reflection.repo.ts`:

```typescript
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import type { Reflection } from '@/lib/schemas/reflection';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface ReflectionRepository {
  getAll(): Promise<Reflection[]>;
  watch(): { subscribe: (cb: (r: Reflection[]) => void) => () => void };
  save(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection>;
  delete(id: string): Promise<void>;
}

export class DexieReflectionRepository implements ReflectionRepository {
  async getAll(): Promise<Reflection[]> {
    return getDb().reflections.orderBy('periodStart').reverse().toArray();
  }

  watch() {
    return from(liveQuery(() => getDb().reflections.orderBy('periodStart').reverse().toArray()));
  }

  async save(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection> {
    const reflection: Reflection = { ...input, id: newId(), createdAt: new Date() };
    await getDb().reflections.add(reflection);
    return reflection;
  }

  async delete(id: string): Promise<void> {
    await getDb().reflections.delete(id);
  }
}

export const reflectionRepo: ReflectionRepository = new DexieReflectionRepository();
```

Create `src/lib/db/streak.repo.ts`:

```typescript
import type { Streak } from '@/lib/schemas/streak';
import { getDb } from './db';

export interface StreakRepository {
  get(): Promise<Streak>;
  save(streak: Streak): Promise<void>;
}

export class DexieStreakRepository implements StreakRepository {
  async get(): Promise<Streak> {
    const db = getDb();
    const existing = await db.streak.get('singleton');
    if (existing) return existing;
    const fresh: Streak = {
      id: 'singleton',
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastSessionDate: '1970-01-01',
      milestonesAchieved: [],
      updatedAt: new Date(),
    };
    await db.streak.put(fresh);
    return fresh;
  }

  async save(streak: Streak): Promise<void> {
    await getDb().streak.put(streak);
  }
}

export const streakRepo: StreakRepository = new DexieStreakRepository();
```

Create `src/lib/db/settings.repo.ts`:

```typescript
import type { Settings } from '@/lib/schemas/settings';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import { getDb } from './db';

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  patch(patch: Partial<Settings>): Promise<Settings>;
}

export class DexieSettingsRepository implements SettingsRepository {
  async get(): Promise<Settings> {
    const db = getDb();
    const existing = await db.settings.get('singleton');
    if (existing) return existing;
    const now = new Date();
    const fresh: Settings = { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now };
    await db.settings.put(fresh);
    return fresh;
  }

  async save(settings: Settings): Promise<void> {
    await getDb().settings.put(settings);
  }

  async patch(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.get();
    const updated: Settings = { ...current, ...patch, updatedAt: new Date() };
    await getDb().settings.put(updated);
    return updated;
  }
}

export const settingsRepo: SettingsRepository = new DexieSettingsRepository();
```

Create `src/lib/db/llm-settings.repo.ts`:

```typescript
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import { getDb } from './db';

export interface LLMSettingsRepository {
  get(): Promise<LLMSettings>;
  save(settings: LLMSettings): Promise<void>;
}

export class DexieLLMSettingsRepository implements LLMSettingsRepository {
  async get(): Promise<LLMSettings> {
    const db = getDb();
    const existing = await db.llmSettings.get('singleton');
    if (existing) return existing;
    const now = new Date();
    const fresh: LLMSettings = {
      id: 'singleton',
      activeProviderName: 'claude',
      providers: {},
      totalTokensThisMonth: 0,
      totalTokensResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      updatedAt: now,
    };
    await db.llmSettings.put(fresh);
    return fresh;
  }

  async save(settings: LLMSettings): Promise<void> {
    await getDb().llmSettings.put(settings);
  }
}

export const llmSettingsRepo: LLMSettingsRepository = new DexieLLMSettingsRepository();
```

Create `src/lib/db/pending-calendar-ops.repo.ts`:

```typescript
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface PendingCalendarOpsRepository {
  enqueue(op: Omit<PendingCalendarOp, 'id' | 'createdAt' | 'attempts'>): Promise<PendingCalendarOp>;
  getAll(): Promise<PendingCalendarOp[]>;
  update(id: string, patch: Partial<PendingCalendarOp>): Promise<void>;
  delete(id: string): Promise<void>;
}

export class DexiePendingCalendarOpsRepository implements PendingCalendarOpsRepository {
  async enqueue(op: Omit<PendingCalendarOp, 'id' | 'createdAt' | 'attempts'>): Promise<PendingCalendarOp> {
    const full: PendingCalendarOp = { ...op, id: newId(), attempts: 0, createdAt: new Date() };
    await getDb().pendingCalendarOps.add(full);
    return full;
  }

  async getAll(): Promise<PendingCalendarOp[]> {
    return getDb().pendingCalendarOps.toArray();
  }

  async update(id: string, patch: Partial<PendingCalendarOp>): Promise<void> {
    await getDb().pendingCalendarOps.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await getDb().pendingCalendarOps.delete(id);
  }
}

export const pendingCalendarOpsRepo: PendingCalendarOpsRepository = new DexiePendingCalendarOpsRepository();
```

Create `src/lib/db/tokens.repo.ts`:

```typescript
import type { Token } from '@/lib/schemas/token';
import { getDb } from './db';

export interface TokensRepository {
  get(): Promise<Token | null>;
  save(token: Token): Promise<void>;
  clear(): Promise<void>;
}

export class DexieTokensRepository implements TokensRepository {
  async get(): Promise<Token | null> {
    const result = await getDb().tokens.get('google');
    return result ?? null;
  }

  async save(token: Token): Promise<void> {
    await getDb().tokens.put(token);
  }

  async clear(): Promise<void> {
    await getDb().tokens.delete('google');
  }
}

export const tokensRepo: TokensRepository = new DexieTokensRepository();
```

- [ ] **Step 7: Verify typecheck + all tests pass**

Run: `npm run typecheck; if ($?) { npm test }`
Expected: typecheck exits 0, all tests pass (15+ total).

- [ ] **Step 8: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: dexie db + 7 repositories with interfaces" }
```

---

## Task 6: React Query provider + useSettings hook

**Files:**
- Create: `src/providers/QueryProvider.tsx`, `src/hooks/useSettings.ts`

**Interfaces:**
- Produces: `QueryProvider` wrapper (referenced in `src/app/layout.tsx`), `useSettings()` hook returning `{ settings, updateSettings, isLoading }`.

- [ ] **Step 1: QueryProvider**

Create `src/providers/QueryProvider.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

If `@tanstack/react-query` is not installed yet, install it:

```powershell
npm install @tanstack/react-query
```

- [ ] **Step 2: useSettings hook**

Create `src/hooks/useSettings.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsRepo, type SettingsRepository } from '@/lib/db/settings.repo';
import type { Settings } from '@/lib/schemas/settings';

const KEY = ['settings'] as const;

export function useSettings(repo: SettingsRepository = settingsRepo) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => repo.get(),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<Settings>) => repo.patch(patch),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    updateSettings: mutation.mutateAsync,
  };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: query provider + useSettings hook" }
```

---

## Task 7: Onboarding screen + personality picker

**Files:**
- Create: `src/app/(onboarding)/page.tsx`, `src/components/onboarding/PersonalityPicker.tsx`

**Interfaces:**
- Produces: `/onboarding` route showing 4-card personality picker. On pick, writes `selectedCoachPersonality` to settings, redirects to `/`.

- [ ] **Step 1: PersonalityPicker component**

Create `src/components/onboarding/PersonalityPicker.tsx`:

```tsx
'use client';

import { motion } from 'motion';
import { COACH_PERSONALITIES, STANDARD_COACH_PERSONALITIES, type CoachPersonality } from '@/lib/schemas/coach-personality';

const PREVIEWS: Record<CoachPersonality, string> = {
  zen: 'Stillness is the practice. Show up.',
  hype: "Let's GO. 30 minutes of full presence!",
  analyst: 'Pattern logged. Variance noted.',
  buddy: 'Nice — glad you carved out the time.',
  athena: '…',  // not shown in onboarding
};

const COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

const LABELS: Record<CoachPersonality, string> = {
  zen: 'Zen',
  hype: 'Hype',
  analyst: 'Analyst',
  buddy: 'Buddy',
  athena: 'Athena',
};

export function PersonalityPicker({ onSelect }: { onSelect: (p: CoachPersonality) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-6">
      {STANDARD_COACH_PERSONALITIES.map((p) => (
        <motion.button
          key={p}
          onClick={() => onSelect(p)}
          whileTap={{ scale: 0.96 }}
          className="rounded-2xl border border-border bg-surface p-4 text-left hover:border-accent transition-colors"
          style={{ borderColor: undefined }}
        >
          <div
            className="w-3 h-3 rounded-full mb-2"
            style={{ backgroundColor: COLORS[p] }}
            aria-hidden
          />
          <div className="font-serif text-xl text-text mb-1">{LABELS[p]}</div>
          <div className="text-sm text-text-muted italic">"{PREVIEWS[p]}"</div>
        </motion.button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Onboarding page**

Create `src/app/(onboarding)/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion';
import { PersonalityPicker } from '@/components/onboarding/PersonalityPicker';
import { useSettings } from '@/hooks/useSettings';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

export default function OnboardingPage() {
  const router = useRouter();
  const { updateSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(p: CoachPersonality) {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ selectedCoachPersonality: p });
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-12 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="font-serif text-3xl text-text leading-tight mb-2">
          Welcome.
        </h1>
        <p className="text-text-muted">
          Pick a voice for your coach. You can change this later.
        </p>

        <PersonalityPicker onSelect={handleSelect} />

        {saving && (
          <p className="text-sm text-text-muted mt-4 animate-pulse">Saving…</p>
        )}
        {error && (
          <p className="text-sm text-hype mt-4">{error}</p>
        )}
      </motion.div>
    </main>
  );
}
```

- [ ] **Step 3: Verify dev server renders onboarding**

Run: `npm run dev`
Visit http://localhost:3000 → redirects to `/onboarding` → renders 4 cards. Click any → redirects to `/` (which will 404 until Task 8). Kill server.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: onboarding screen with personality picker" }
```

---

## Task 8: Tab bar + FAB shell + Home (empty state)

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/ui/TabBar.tsx`, `src/components/ui/FAB.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Button.tsx`, `src/components/streak/StreakFlame.tsx`
- Create placeholder pages: `src/app/(app)/sessions/page.tsx`, `reflect/page.tsx`, `llm/page.tsx`, `settings/page.tsx`

**Interfaces:**
- Produces: 5-tab navigation with FAB, Home page showing warm empty state. All 4 other tabs render placeholders.

- [ ] **Step 1: Button primitive**

Create `src/components/ui/Button.tsx`:

```tsx
'use client';

import { motion } from 'motion';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-base hover:bg-accent-hover',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-transparent text-hype hover:bg-surface-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', className = '', children, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.96 }}
      className={`rounded-2xl px-4 py-3 font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
});
```

- [ ] **Step 2: Card primitive**

Create `src/components/ui/Card.tsx`:

```tsx
import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: Props) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: StreakFlame (placeholder visual)**

Create `src/components/streak/StreakFlame.tsx`:

```tsx
'use client';

import { motion } from 'motion';

interface Props {
  days: number;
  onTap?: () => void;
}

export function StreakFlame({ days, onTap }: Props) {
  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3"
      aria-label={`${days} day streak`}
    >
      <span className="text-2xl" role="img" aria-hidden>🔥</span>
      <div className="text-left">
        <div className="font-serif text-2xl text-accent leading-none">{days}</div>
        <div className="text-xs text-text-muted">day streak</div>
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 4: TabBar**

Create `src/components/ui/TabBar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListTodo, Sparkles, Cpu, Settings as SettingsIcon } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/sessions', label: 'Sessions', icon: ListTodo },
  { href: '/reflect', label: 'Reflect', icon: Sparkles },
  { href: '/llm', label: 'LLM', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-base/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-2 gap-1 text-xs transition-colors ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: FAB**

Create `src/components/ui/FAB.tsx`:

```tsx
'use client';

import { motion } from 'motion';
import { Plus } from 'lucide-react';

interface Props {
  onClick: () => void;
  label?: string;
}

export function FAB({ onClick, label = 'New session' }: Props) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      className="fixed bottom-20 right-4 z-10 rounded-full bg-accent text-base shadow-lg shadow-accent/30 w-14 h-14 flex items-center justify-center"
      aria-label={label}
    >
      <Plus size={24} strokeWidth={2.5} />
    </motion.button>
  );
}
```

- [ ] **Step 6: App layout (tab bar + FAB)**

Create `src/app/(app)/layout.tsx`:

```tsx
'use client';

import { type ReactNode, useState } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';

export default function AppLayout({ children }: { children: ReactNode }) {
  const [fabAction, setFabAction] = useState<() => void>(() => () => {
    // Placeholder — Wave 2 wires this to the New Session sheet
    console.log('FAB tapped');
  });

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={fabAction} />
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 7: Home (empty state)**

Create `src/app/(app)/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StreakFlame } from '@/components/streak/StreakFlame';
import { useSettings } from '@/hooks/useSettings';
import { streakRepo } from '@/lib/db/streak.repo';

export default function HomePage() {
  const { settings } = useSettings();
  const { data: streak } = useQuery({
    queryKey: ['streak'],
    queryFn: () => streakRepo.get(),
  });

  const name = settings?.displayName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="font-serif text-2xl text-text mb-1">
        {greeting}{name ? `, ${name}` : ''}.
      </h1>
      <p className="text-text-muted text-sm mb-6">
        No sessions yet. The first step is the whole path.
      </p>

      <div className="mb-6">
        <StreakFlame days={streak?.currentStreakDays ?? 0} />
      </div>

      <Card className="text-center py-12">
        <div className="text-text-muted text-sm mb-4">
          Your practice log is empty.
        </div>
        <Button>Start your first session</Button>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 8: Placeholder pages**

Create `src/app/(app)/sessions/page.tsx`:

```tsx
export default function SessionsPage() {
  return <div className="text-text-muted">Sessions list — Wave 2</div>;
}
```

Create `src/app/(app)/reflect/page.tsx`:

```tsx
export default function ReflectPage() {
  return <div className="text-text-muted">Reflections — Wave 3</div>;
}
```

Create `src/app/(app)/llm/page.tsx`:

```tsx
export default function LLMPage() {
  return <div className="text-text-muted">LLM providers — Wave 3</div>;
}
```

Create `src/app/(app)/settings/page.tsx`:

```tsx
'use client';

import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Settings</h1>

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Active coach
        </div>
        <div className="font-serif text-xl mb-3 capitalize">
          {settings?.selectedCoachPersonality ?? '—'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['zen', 'hype', 'analyst', 'buddy'] as const).map((p) => (
            <Button
              key={p}
              variant={settings?.selectedCoachPersonality === p ? 'primary' : 'ghost'}
              onClick={() => updateSettings({ selectedCoachPersonality: p })}
            >
              {p}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Data
        </div>
        <Button variant="danger">Clear all data</Button>
        <p className="text-text-muted text-xs mt-2">
          Wipes IndexedDB and reloads. Cannot be undone.
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9: Verify full flow**

Run: `npm run dev`
Visit http://localhost:3000 → onboarding renders → pick a personality → redirects to Home → Home renders greeting + empty state + Settings tab works (switching personality updates the badge). All 4 other tabs render placeholders. Kill server.

- [ ] **Step 10: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: 5-tab nav shell + warm empty home state" }
```

---

## Task 9: Project README + final Wave 1 verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: Project README with setup + dev commands + Wave 1 status.

- [ ] **Step 1: README**

Create `README.md`:

```markdown
# chrono-kata

A personal, mobile-first practice tracker. Log time-on-task, reps, and a 1–5 subjective rating. Optional AI coach. Optional Google Calendar export. Local-first (no backend, no auth).

## Status

**Wave 1: Foundation** — runnable PWA skeleton with local DB, schemas, repository layer, onboarding, and tab-bar shell. No business logic yet.

## Tech stack

- Next.js 15 (App Router) + React 19 + TypeScript 5 (strict)
- Tailwind CSS 4 (warm dark theme)
- Dexie 4 (IndexedDB)
- Zod 3 (runtime validation)
- @serwist/next (PWA service worker)
- Vitest + Testing Library + Playwright

## Setup

```powershell
npm install
npm run dev
```

Visit http://localhost:3000.

## Athena coach setup

The Athena persona prompt is gitignored. To enable:

1. Copy `src/lib/coaches/athena-persona.ts.example` to `src/lib/coaches/athena-persona.ts`
2. Replace the placeholder string with the full persona prompt
3. Save. The file will not be committed.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest unit/integration
- `npm run test:e2e` — Playwright
- `npm run lint` — ESLint

## Google Calendar (optional, Wave 4)

For calendar export, register a Google Cloud OAuth client ID and add to `.env.local`:

```
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

## Architecture

See [docs/superpowers/specs/chrono-kata-design.md](docs/superpowers/specs/chrono-kata-design.md) for the full spec and [docs/superpowers/plans/](docs/superpowers/plans/) for wave-by-wave implementation plans.
```

- [ ] **Step 2: Final typecheck + tests + build**

Run: `npm run typecheck; if ($?) { npm test }; if ($?) { npm run build }`
Expected: typecheck exits 0, all tests pass, build succeeds with no errors.

- [ ] **Step 3: Commit**

```powershell
git add .; if ($?) { git commit -m "docs: wave 1 readme + verification" }
```

---

## Wave 1 Definition of Done

- [ ] `npm run dev` starts without errors
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all unit tests pass (15+ tests across schemas + repos)
- [ ] `npm run build` succeeds
- [ ] `/onboarding` renders 4 personality cards
- [ ] Picking a personality persists to IndexedDB and redirects to `/`
- [ ] `/` shows warm empty state with greeting + streak (0) + CTA
- [ ] All 5 tabs render (Home live, others placeholders)
- [ ] Settings → personality switch works and persists
- [ ] Service worker registers in production build
- [ ] README exists with setup instructions
- [ ] All commits made with conventional-commit prefixes

## What's Next (Subsequent Waves)

- **Wave 2: Core entities** — Session CRUD UI, sessions list, dashboard populated, streak computation logic, milestone celebrations.
- **Wave 3: LLM stack** — Port dharma-vicaya adapters (11 providers, 3 adapter classes, factory), coach comment generation, weekly reflection, smart label suggestion.
- **Wave 4: Calendar** — GIS OAuth, calendar sync queue, per-save export.
- **Wave 5: Polish** — Athena unlock mechanic, LLM provider settings UI, full milestone celebrations, Lighthouse pass to ≥80.
