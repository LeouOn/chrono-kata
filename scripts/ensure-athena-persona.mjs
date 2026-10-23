#!/usr/bin/env node
/**
 * Materialize the placeholder Athena persona when the local persona file is missing.
 *
 * `src/lib/coaches/athena-persona.ts` is gitignored so a personal persona never
 * reaches git, but `src/lib/coaches/index.ts` imports it, so a fresh clone without
 * that file cannot build, typecheck or test: webpack reports "Module not found:
 * Can't resolve './athena-persona'" and every page answers 500.
 *
 * This copies the tracked placeholder (`athena-persona.ts.example`) into place once.
 * It never overwrites a persona the user already wrote.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'src/lib/coaches/athena-persona.ts');
const source = join(repoRoot, 'src/lib/coaches/athena-persona.ts.example');

try {
  if (existsSync(target)) {
    process.exit(0);
  }
  if (!existsSync(source)) {
    console.warn('[athena] src/lib/coaches/athena-persona.ts.example is missing; skipping.');
    process.exit(0);
  }
  copyFileSync(source, target);
  console.log('[athena] Created src/lib/coaches/athena-persona.ts from the placeholder example.');
} catch (error) {
  console.warn(`[athena] Could not create src/lib/coaches/athena-persona.ts: ${error instanceof Error ? error.message : String(error)}`);
}
