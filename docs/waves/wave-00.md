# Wave 0 — audit and baseline (part A)

**Status:** complete (this PR) · **Roadmap:** [`chrono-kata-roadmap.md`](../../chrono-kata-roadmap.md) Wave 0
**Companion:** `docs/ROADMAP_STATUS.md` (part B, the wave-by-wave exists/partial/missing map and the lead's decisions)

Wave 0 is an audit wave: no product behaviour changes.

## Shipped

- `docs/ARCHITECTURE.md` — current state of routes, state management, LLM
  provider abstraction and coach pipeline (including the T5 pacing payload and
  output guard), timer engine, habit/streak logic, kata templates, pacing,
  calendar interop, Capacitor/PWA runtime, test topology, and the findings that
  contradict a roadmap wave. It also states that `docs/superpowers/plans/`
  holds an earlier, unrelated wave1–wave16 series, so the two numbering schemes
  are not confused.
- `docs/DATA_MODEL.md` — Dexie versions and store definitions through v6, row
  shapes, repositories, the v2 backup envelope with `migrateEnvelope`, the
  schema CHANGELOG conventions, and the reserved version numbers (**v7 is the
  next free version**).
- `docs/TOOLING.md` — what Vitest, Playwright, ESLint and TypeScript actually
  enforce, what they miss, measured timings, and the build artifacts that touch
  the working tree.
- `npm run ci` — typecheck + lint + unit tests + production build in one
  command (~19 s warm; verified to build with no network). E2E stays a separate
  `npm run test:e2e` because it needs a prior build and browser binaries.
- `npm run setup:worktree` (`scripts/setup-worktree.sh`) — make a fresh
  `git worktree add` or clean checkout usable: install dependencies when
  missing, then typecheck. The gitignored Athena persona is materialized by the
  `postinstall` hook, not by this script.
- `tests/fixtures/` — synthetic data for future migration tests: a complete
  backup envelope v2 JSON and a raw Dexie v6 dump (typed module with real
  `Date`s), plus tests that keep both valid:
  - `tests/unit/data-transfer/fixtures.test.ts` — the envelope parses with no
    skipped rows and restores through `replaceAll`.
  - `tests/unit/db/migrations.test.ts` — a v6 store snapshot plus a test that
    opens the v6 dump at the current version with every row and index intact.

## Deferred / not in this PR

- `docs/ROADMAP_STATUS.md` is part B (different owner, separate PR).
- No product code, no dependency changes, no tooling changes beyond the two npm
  scripts and `scripts/setup-worktree.sh`.
- Hosted CI is deliberately absent (decision Q10).

## Known issues recorded, not fixed here

Captured in `docs/TOOLING.md` §8 and `docs/ARCHITECTURE.md` §13: no React hooks
lint rules, `next build`'s lint phase is a no-op under the flat config,
`public/sw.js` churn after every build, single-browser Playwright matrix, no
coverage gate.
