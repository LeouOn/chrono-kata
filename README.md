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
