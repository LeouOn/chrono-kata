# Tooling — audit and the one-command gate

Audited 2026-10-23. This covers what exists, what is off, and the two things
Wave 0 added: `npm run ci` and `npm run setup:worktree`.

Environment used for every measurement below: Node **v24.21.0**, npm
**11.19.0**, Linux, Chromium for Playwright already installed in the local
browser cache.

## 1. Setup

```bash
git clone … && cd chrono-kata
npm install          # or: npm run setup:worktree   (same thing, with a typecheck)
npm run dev          # web dev server
```

`scripts/setup-worktree.sh` (wired as `npm run setup:worktree`) exists for
`git worktree add` / clean checkouts: it installs dependencies when
`node_modules` is missing and then typechecks. The `postinstall` hook
(`scripts/ensure-athena-persona.mjs`) materializes the gitignored
`src/lib/coaches/athena-persona.ts` from its tracked `.example`; the setup
script does not duplicate that.

Notes that cost agents time before:

- `node_modules` must be reinstalled after a `git pull` that adds a dependency.
  `package.json` once declared `@capacitor/local-notifications` while the
  checkout lacked it, so `npm run typecheck` failed on a clean tree.
- A worktree with a **symlinked** `node_modules` works for tests and builds, but
  `.gitignore` lists `node_modules/`, which does not match a symlink — check
  `git status` before committing, or the symlink itself gets staged.

## 2. `npm run ci` (the gate)

```json
"ci": "npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e"
```

- Runs sequentially; the first failure stops the gate. It covers the roadmap's
  definition of done (typecheck, lint, unit tests, e2e, build).
- Warm run on this machine: **~45 s** (typecheck ~5 s, lint ~1 s, Vitest ~7 s,
  production build ~5 s, Playwright 18 specs ~25 s).
- The build **works offline**: `rm -rf .next && unshare -rn npx next build`
  exits 0 in a network-less namespace. No font/telemetry fetch is needed.
- E2E is the slow, machine-dependent part: it needs Chromium
  (`npx playwright install chromium`) and a free port. Skip it while iterating
  with `npm run precommit` (typecheck + lint + unit tests only).
- It is the only CI: there is **no `.github/` workflow**, so nothing runs on
  push. Decision Q10 in `docs/ROADMAP_STATUS.md` keeps CI local until the human
  asks for hosted CI.

**Parallel e2e runs:** `playwright.config.ts` reads `PLAYWRIGHT_PORT`
(default `3008`) for both `baseURL` and the `next start` web server. Several
agents share one host, so export a distinct port per seat:

```bash
PLAYWRIGHT_PORT=3018 npm run test:e2e
PLAYWRIGHT_PORT=3018 npm run ci        # the whole gate on that port
```

## 3. Vitest (unit + component)

`vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`
(`fake-indexeddb/auto` + `@testing-library/jest-dom/vitest`), include glob
`tests/**/*.test.ts(x)`. `tests/fixtures/**` is therefore never collected as a
test. Coverage is not configured and not reported.

- Database tests use `fake-indexeddb`; helpers `resetDbForTesting()` /
  `getDb()` live in `src/lib/db/db.ts`.
- **Timezone:** the suite does not pin `TZ`. Tests that depend on the local day
  either set `process.env.TZ` themselves and restore it
  (`tests/unit/tz/date-tz.test.ts`) or use `vi.useFakeTimers({ toFake: ['Date'] })`
  with `vi.setSystemTime(...)` (the pattern in `tests/unit/db/check-in.repo.test.ts`).
  Fixtures written as UTC timestamps produce timezone-dependent **local** day
  keys — assert on relationships, not on a specific derived date.
- The Vite CJS deprecation warning on every run is upstream noise.
- `npm test` is `vitest run` (single pass). `npm run test:watch` for the loop.

## 4. Playwright (e2e)

`playwright.config.ts`: one project (default device → Chromium), `workers: 1`,
`fullyParallel: false`, `webServer` runs **`npx next start -p 3008`** with
`reuseExistingServer: false` — so a build must exist before the run and the
port must be free. `retries: 2` and `forbidOnly` when `process.env.CI` is set
(which also means `CI=1 npm run test:e2e` behaves differently locally).
Traces are recorded on the first retry; `test-results/` and
`playwright-report/` are gitignored.

- Current baseline: **18/18** after the Athena spec repair (PR #8).
- Port is overridable: `PLAYWRIGHT_PORT=3018 npm run test:e2e`. The default
  stays 3008; the web server is never reused (`reuseExistingServer: false`), so
  two suites on one port fail loudly instead of sharing a server.
- Browser binaries are not installed by `npm install`; a fresh machine needs
  `npx playwright install chromium`.
- Specs share state through `localStorage` (`onboarding-completed`) set via
  `page.addInitScript`, and each test gets a fresh context, so IndexedDB starts
  empty per spec.

## 5. ESLint

Flat config (`eslint.config.mjs`): `@typescript-eslint/parser` on
`**/*.{ts,tsx}` plus `@next/eslint-plugin-next` `recommended` +
`core-web-vitals` rules. `npm run lint` = `eslint src`.

What is off:

- **No `react-hooks` rules** (no `eslint-plugin-react-hooks`), so
  `exhaustive-deps` and unconditional-hook mistakes are not caught. One such
  bug already shipped once and was fixed by hand ("keep session detail hooks
  above early return").
- **No lint coverage outside `src/`** — `tests/`, `scripts/` and config files
  are unlinted.
- **No type-aware rules** and no jsx-a11y rules.
- `next build` still runs its own lint phase and prints
  “The Next.js plugin was not detected in your ESLint configuration” because
  the flat config registers the plugin under the `@next/next` namespace its
  detector does not recognize. Consequence: the build-phase lint is a no-op,
  and the explicit `eslint src` in `npm run ci` is what actually lints.
  Changing the config changes lint results; do it deliberately, not as a side
  effect of another wave.

## 6. TypeScript

`npm run typecheck` = `tsc --noEmit`. `tsconfig.json` has `strict: true`,
`noUncheckedIndexedAccess: true`, `isolatedModules`, `skipLibCheck: true`,
`moduleResolution: "bundler"`, alias `@/* → ./src/*`. Not enabled:
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`. Build
info is written to `tsconfig.tsbuildinfo` (gitignored).

## 7. Build artifacts that touch the working tree

- `next build` **rewrites the tracked `public/sw.js`** (Serwist writes its
  precache manifest, whose chunk hashes change per build). After
  `npm run ci` the tree is dirty even with no source changes. Wave 0 restores
  the file rather than committing the churn; gitignoring `public/sw.js` and
  generating it only at build time is a reasonable follow-up for a later
  tooling wave, but it changes what a bare checkout serves, so it was left
  alone here.
- `npm run build:android` produces `out/` (gitignored) and temporarily renames
  `src/app/api` → `src/app/_api`; it restores it in a `finally` block. Do not
  run it concurrently with another build in the same checkout.
- `.next/`, `out/`, `tsconfig.tsbuildinfo`, `test-results/`,
  `playwright-report/` are gitignored.

## 8. Open tooling items (not changed in Wave 0)

1. No hosted CI (deliberate; Q10).
2. No React hooks lint rules; several hook-order/deps mistakes have already
   needed manual fixes.
3. `next build` lints nothing because of the flat-config plugin-name mismatch.
4. `public/sw.js` churn after every build (see §7).
5. Playwright is a single Chromium project — no Firefox/WebKit matrix, no
   mobile device profile, despite a mobile-first product.
6. The e2e port is only overridable by environment variable; nothing picks a
   free port automatically, so `npm run ci` on a busy host fails at the web
   server unless `PLAYWRIGHT_PORT` is set.
7. No coverage threshold and no bundle-size gate.
