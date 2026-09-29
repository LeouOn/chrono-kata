import { afterAll, describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const GLOBALS = path.resolve(__dirname, '../../../src/app/globals.css');
const css = readFileSync(GLOBALS, 'utf8');

/**
 * Gradient stops read through inline `style={{ background: 'var(--color-athena-from)' }}`
 * in AthenaReveal.tsx, so they resolve at runtime and are deliberately not Tailwind
 * colours — registering them would only mint meaningless `bg-athena-from` utilities.
 */
const NOT_TAILWIND_COLORS = new Set(['--color-athena-from', '--color-athena-to']);

function tokensDeclaredInThemeBlocks(source: string): Set<string> {
  const registered = new Set<string>();
  for (const match of source.matchAll(/@theme[^{]*\{([^}]*)\}/g)) {
    for (const decl of match[1]!.matchAll(/(--color-[a-z0-9-]+)\s*:/g)) {
      registered.add(decl[1]!);
    }
  }
  return registered;
}

function tokensUsedAnywhere(source: string): Set<string> {
  return new Set([...source.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

describe('theme tokens', () => {
  it('registers every colour token in an @theme block', () => {
    const registered = tokensDeclaredInThemeBlocks(css);
    const used = tokensUsedAnywhere(css);
    const missing = [...used]
      .filter((token) => !NOT_TAILWIND_COLORS.has(token))
      .filter((token) => !registered.has(token));

    expect(
      missing,
      'These --color-* tokens are set on :root but never registered in @theme, so Tailwind ' +
        'emits no utility for them and every class using them is a silent no-op. Add each to ' +
        'the @theme inline block in src/app/globals.css.',
    ).toEqual([]);
  });

  it('keeps the runtime variable and the Tailwind token in sync', () => {
    // `@theme inline` makes Tailwind emit `var(--color-x)` rather than resolving the
    // value at build time, which is what lets the data-theme overrides still apply.
    const inline = /@theme inline\s*\{([^}]*)\}/.exec(css);
    expect(inline, 'globals.css is missing an `@theme inline` block').not.toBeNull();

    for (const decl of inline![1]!.matchAll(/(--color-[a-z0-9-]+)\s*:\s*var\((--color-[a-z0-9-]+)\)/g)) {
      expect(decl[2], `${decl[1]} must point at the runtime variable of the same name`).toBe(decl[1]);
    }
  });

  it('defines --color-danger, which components use but the theme never declared', () => {
    expect(tokensUsedAnywhere(css), '--color-danger is used by ConversationThread.tsx').toContain(
      '--color-danger',
    );
  });
});

// Compiles the real stylesheet so the assertions above are backed by real output.
const workDir = mkdtempSync(path.join(process.cwd(), 'node_modules/.cache/theme-token-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('compiled output', () => {
  it('emits utilities for the theme tokens', async () => {
    const probe = path.join(workDir, 'probe.html');
    writeFileSync(
      probe,
      '<div class="text-text-muted bg-surface-2 border-border bg-surface text-text ' +
        'text-accent bg-accent text-zen text-hype text-analyst text-buddy bg-base ' +
        'bg-danger text-danger"></div>\n',
    );

    const entry = path.join(workDir, 'entry.css');
    writeFileSync(entry, `@import 'tailwindcss';\n@source "./probe.html";\n${css}\n`);

    const result = await postcss([tailwindcss()]).process(readFileSync(entry, 'utf8'), {
      from: entry,
    });

    const expected = [
      '.text-text-muted',
      '.bg-surface-2',
      '.border-border',
      '.bg-surface',
      '.text-text',
      '.text-accent',
      '.bg-accent',
      '.text-zen',
      '.text-hype',
      '.text-analyst',
      '.text-buddy',
      '.bg-base',
      '.bg-danger',
      '.text-danger',
    ];

    const missing = expected.filter(
      (selector) => !new RegExp(`\\${selector}(?![a-zA-Z0-9_-])`).test(result.css),
    );
    expect(missing, 'these classes are used across the app but emit no CSS').toEqual([]);
  }, 60_000);
});
