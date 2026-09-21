# chrono-kata

A personal, mobile-first practice tracker. Log time-on-task, reps, and a 1–5 subjective rating. Optional AI coach. Optional Google Calendar export. Local-first (no backend, no auth).

## Status

**Feature-complete through Wave 16** — the full practice loop ships: timed/reps sessions with 1–5 ratings and focus/energy/mood state, kata quick-start templates, a multi-provider AI coach (branching chat, daily briefing, weekly reflections), insights (rating trends, activity breakdown, heatmap, 365-day consistency matrix), habit goals with streak protection and rest days, Google Calendar export, themes, notifications, and JSON export/import. Local-first: all data lives in IndexedDB. Hardened with Vitest unit tests and Playwright e2e suites.

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

## Desktop environment keys and Android setup

Run `npm run dev:local` on your computer to discover provider keys from the
launching shell or `.env.local`. This starts a loopback-only Next.js server at
`http://127.0.0.1:3000`. Open the LLM tab to see detected providers, select
**Use desktop key** for an existing configuration, or **Test connection** to
make a small real request. Existing pasted keys and chosen models are preserved.
`DEFAULT_PROVIDER` selects the initial provider; otherwise preference is
DeepSeek, then ZAI, then OpenRouter. DeepSeek uses `deepseek-flash` (V4.1 Flash),
OpenRouter uses `deepseek/deepseek-v4.1-flash`, and ZAI uses `glm-5.3` at
`https://api.z.ai/api/coding/paas/v4`. `Z_AI_API_KEY` and `ZAI_API_KEY` both
configure ZAI. Custom environment model/URL overrides take precedence.
Older saved presets are upgraded once: DeepSeek V4 Flash to `deepseek-flash`,
ZAI's old `bigmodel.cn` URL / GLM 5.2 to the coding endpoint / GLM 5.3, and
OpenRouter's old Sonnet preset to DeepSeek V4.1 Flash. Other saved values remain.

Environment keys stay on the server; only provider metadata reaches the browser.
Set `PROVIDER_MODEL` / `PROVIDER_BASE_URL` in the environment as shown in
`.env.example`; the model can also be edited in the LLM tab. Restart the local
server after changing environment variables. A detected key is not necessarily
a valid key or a working model—use Test connection to verify.

On Android (or a hosted website), open **LLM → Add**, paste your key, enter the
model, and test the connection. Pasted keys stay in that browser’s IndexedDB and
are sent directly to the provider. A hosted page cannot read your desktop shell.
Desktop environment connections are excluded from backups; pasted keys are
stripped, so they must be re-entered after restoring on a new device.

Do not put API keys in `NEXT_PUBLIC_*` variables or `next.config.ts`'s `env` map:
those values become public JavaScript. Older builds used that map; rebuild and
replace any old deployed assets/service-worker caches before sharing the app.
The local AI endpoint is disabled for normal `npm run dev` / `npm start`; the
local launcher enables it and binds to loopback. It is not a hosted AI gateway.

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
