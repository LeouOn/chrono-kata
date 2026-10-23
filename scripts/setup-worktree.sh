#!/usr/bin/env bash
# Bootstrap a fresh checkout or `git worktree add` so it can typecheck, test
# and build.
#
#   npm run setup:worktree
#
# Safe to re-run. The only step is dependency installation: `npm install`
# triggers the `postinstall` hook, which materializes the gitignored
# `src/lib/coaches/athena-persona.ts` from its tracked `.example` when missing
# (see `scripts/ensure-athena-persona.mjs`). Without that persona file,
# typecheck fails and the coach tests cannot collect.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "==> worktree: $root"

# Always install: a bare worktree has no node_modules, and a stale checkout can
# be missing a dependency that package.json already declares (typecheck once
# failed on @capacitor/local-notifications for exactly that reason). npm install
# is a cheap no-op when everything is present.
echo "==> dependencies: npm install"
npm install

# Prove the install was enough: typecheck reaches every source file, including
# the coach persona import.
echo "==> typecheck"
npm run typecheck

echo "==> ready: npm run ci runs typecheck + lint + unit tests + build + e2e"
