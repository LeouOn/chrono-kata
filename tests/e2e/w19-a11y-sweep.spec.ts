import { test, expect, type Page } from '@playwright/test';

/**
 * Roadmap Wave 19: the in-house accessibility sweep.
 *
 * No axe-core (no new dependency): every rule here is computed from the DOM in
 * the page, at the phone viewport the app targets. The sweep is the gate for
 * the rest of the wave, so it is deliberately strict and it names what it found.
 *
 * Rules, per route:
 * - every interactive control has an accessible name, and a control with visible
 *   text has that text inside its name (label-in-name);
 * - every visible target is at least 44x44, except a visually hidden input whose
 *   visible control is large enough (the standard sr-only + styled button pair);
 * - no horizontal scroll at 390x844;
 * - exactly one <h1>, heading levels do not skip, one <main> and at least one <nav>;
 * - every <svg> is aria-hidden or carries an accessible name;
 * - focus is visible on the first tab stop;
 * - with reduced motion requested, no CSS animation or transition runs, and a
 *   modal opens without a transform animation.
 */

test.use({ viewport: { width: 390, height: 844 } });

const ROUTES = [
  '/',
  '/inbox',
  '/plan',
  '/timeline',
  '/sessions',
  '/reflect',
  '/insights',
  '/llm',
  '/settings',
  '/journal',
  '/review',
  '/projects',
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

/** Turn the preview flag on so the sweep sees the fullest UI. */
async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

interface Violation {
  kind: string;
  element: string;
  detail: string;
}

/** The audit, run in the page, so it sees the rendered DOM and computed styles. */
async function auditPage(page: Page): Promise<Violation[]> {
  return page.evaluate(() => {
    const violations: { kind: string; element: string; detail: string }[] = [];
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/).slice(0, 3).join('.')}` : '';
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0
      );
    };
    /** Rendered text, skipping aria-hidden decorations and hidden subtrees. */
    const visibleTextOf = (el: Element): string => {
      const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const element = node as Element;
        if (element.getAttribute('aria-hidden') === 'true') return '';
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return '';
        return Array.from(element.childNodes).map(walk).join(' ');
      };
      return walk(el).replace(/\s+/g, ' ').trim();
    };
    const accessibleName = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (text) return text;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
          const text = Array.from(labels)
            .map((label) => label.textContent ?? '')
            .join(' ')
            .trim();
          if (text) return text;
        }
      }
      const wrapping = el.closest('label');
      if (wrapping) return (wrapping.textContent ?? '').trim();
      const title = el.getAttribute('title');
      if (title?.trim()) return title.trim();
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    };

    const selector =
      'a[href], button, input, select, textarea, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const controls = Array.from(document.querySelectorAll(selector)).filter(
      // Dense data-visualisation cells (a year heatmap at 390px) cannot be
      // 44px each without destroying the view; they are exempt by the wave's
      // documented decision and still carry a name and a title.
      (el) => !(el as HTMLInputElement).disabled && el.getAttribute('data-a11y-exempt') !== 'dense-grid',
    );

    for (const el of controls) {
      if (!visible(el)) continue;
      const name = accessibleName(el);
      if (name === '') {
        violations.push({ kind: 'unnamed-control', element: describe(el), detail: 'no accessible name' });
        continue;
      }
      // Label-in-name applies to controls whose own label is text the person
      // reads (buttons, links, role=button). A text field's value, a select's
      // options and a textarea's content are not labels.
      const labelledByOwnText =
        !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement);
      const visibleText = labelledByOwnText ? visibleTextOf(el) : '';
      // Compare with whitespace removed: text split across inline elements
      // ("15 m" from "15" + "m") is the same text to a reader, and axe
      // normalises it the same way.
      const squash = (value: string) => value.replace(/\s+/g, '').toLowerCase();
      if (visibleText !== '' && !squash(name).includes(squash(visibleText))) {
        violations.push({
          kind: 'label-in-name',
          element: describe(el),
          detail: `visible "${visibleText}" is not in the name "${name}"`,
        });
      }
      // A checkbox or radio's real target is its label: clicking the label
      // toggles it, so the label is what has to be big enough.
      const labelForField =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? (el.labels?.[0] ?? el.closest('label'))
          : null;
      const target = labelForField && visible(labelForField) ? labelForField : el;
      const rect = target.getBoundingClientRect();
      const tiny = rect.width < 44 || rect.height < 44;
      if (tiny) {
        // A visually hidden file input is fine: the visible button next to it is
        // the control (the standard sr-only input + styled button pattern).
        const hiddenFileInput =
          el instanceof HTMLInputElement &&
          el.type === 'file' &&
          (el.getBoundingClientRect().width < 2 || el.getBoundingClientRect().height < 2);
        if (!hiddenFileInput) {
          violations.push({
            kind: 'target-size',
            element: describe(target),
            detail: `${Math.round(rect.width)}x${Math.round(rect.height)} is under 44x44`,
          });
        }
      }
    }

    // No horizontal scroll.
    if (document.documentElement.scrollWidth > window.innerWidth) {
      violations.push({
        kind: 'horizontal-scroll',
        element: 'documentElement',
        detail: `${document.documentElement.scrollWidth} > ${window.innerWidth}`,
      });
    }

    // One h1, no skipped heading levels.
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(visible);
    const h1s = headings.filter((h) => h.tagName === 'H1');
    if (h1s.length !== 1) {
      violations.push({ kind: 'heading-h1', element: 'headings', detail: `${h1s.length} h1 elements` });
    }
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      if (previous !== 0 && level > previous + 1) {
        violations.push({
          kind: 'heading-order',
          element: describe(heading),
          detail: `h${previous} -> h${level}`,
        });
      }
      previous = level;
    }

    // Landmarks.
    if (document.querySelectorAll('main').length !== 1) {
      violations.push({
        kind: 'landmark-main',
        element: 'document',
        detail: `${document.querySelectorAll('main').length} <main> elements`,
      });
    }
    if (document.querySelectorAll('nav').length === 0) {
      violations.push({ kind: 'landmark-nav', element: 'document', detail: 'no <nav>' });
    }

    // Icons: decorative or named, never an unnamed image to a screen reader.
    for (const svg of Array.from(document.querySelectorAll('svg')).filter(visible)) {
      const hidden = svg.getAttribute('aria-hidden') === 'true';
      const named = svg.getAttribute('aria-label')?.trim() || svg.querySelector('title')?.textContent?.trim();
      if (!hidden && !named) {
        violations.push({ kind: 'unnamed-svg', element: describe(svg), detail: 'no aria-hidden and no name' });
      }
    }

    return violations;
  });
}

test('every route passes the in-house a11y sweep at 390x844', async ({ page }) => {
  await enableTaskInbox(page);
  const failures: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route);
    // Let the client-side queries paint; the audit only judges what is rendered.
    await page.waitForTimeout(250);
    const violations = await auditPage(page);
    for (const violation of violations) {
      failures.push(`${route} [${violation.kind}] ${violation.element}: ${violation.detail}`);
    }
  }

  expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
});

/**
 * Contrast of the theme tokens, computed from the CSS variables the app really
 * uses (the values live in globals.css, so a test that hard-codes them would
 * pass after somebody changed the theme).
 */
/** Set the theme the way the app reads it (the settings row), then reload. */
async function applyTheme(
  page: Page,
  theme: 'light' | 'dark' | 'system',
  accent: string,
  highContrast = false,
) {
  await page.goto('/');
  // Wait for the app to create/upgrade the database before opening it raw, so
  // the open cannot create an empty v1 instead.
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some((entry) => entry.name === 'chrono-kata' && (entry.version ?? 0) >= 8);
  });
  await page.evaluate(async ({ theme, accent, highContrast }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = () =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
        request.onerror = () => reject(request.error);
      });
    // The app creates the settings row on its first read; wait for it.
    let row = await read();
    for (let attempt = 0; attempt < 40 && !row; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      row = await read();
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({
        ...(row ?? { id: 'singleton' }),
        id: 'singleton',
        theme,
        accentColor: accent,
        highContrast,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { theme, accent, highContrast });
  await page.reload();
  await page.waitForFunction(
    ({ theme, accent, highContrast }) =>
      // 'system' resolves through prefers-color-scheme, so the attribute is absent.
      (theme === 'system'
        ? document.documentElement.getAttribute('data-theme') === null
        : document.documentElement.getAttribute('data-theme') === theme) &&
      document.documentElement.getAttribute('data-accent') === accent &&
      (highContrast
        ? document.documentElement.getAttribute('data-contrast') === 'high'
        : document.documentElement.getAttribute('data-contrast') === null),
    { theme, accent, highContrast },
  );
}

/**
 * The computed colours of real elements, not just the tokens: a body
 * background, a text-accent link and a primary (bg-accent) button, with the
 * WCAG ratio between them.
 */
async function measureComputedContrast(page: Page) {
  return page.evaluate(() => {
    // Tokens come as 3- or 6-digit hex, element colours as rgb()/rgba().
    const parse = (value: string) => {
      const text = value.trim();
      if (text.startsWith('#')) {
        const hex = text.length === 4 ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` : text;
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      }
      return (text.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
    };
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
    const ratio = (a: string, b: string) => {
      const la = luminance(parse(a));
      const lb = luminance(parse(b));
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    // The page background is the base token: `body` itself is transparent, so
    // measuring against its computed colour would compare against black.
    const body = getComputedStyle(document.documentElement).getPropertyValue('--color-base').trim();
    const accentToken = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    const link = document.querySelector('.text-accent');
    // A primary button, not a progress bar or a dot that merely paints itself
    // with the accent: the pair that matters is accent background + text.
    const button =
      document.querySelector('.bg-accent.text-base') ??
      document.querySelector('button.bg-accent') ??
      document.querySelector('a.bg-accent');
    const linkColour = link ? getComputedStyle(link).color : null;
    const buttonBackground = button ? getComputedStyle(button).backgroundColor : null;
    const buttonText = button ? getComputedStyle(button).color : null;
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
    const tokenRatios = {
      'text/base': ratio(token('text'), token('base')),
      'text/surface': ratio(token('text'), token('surface')),
      'text-muted/surface': ratio(token('text-muted'), token('surface')),
      'accent/base': ratio(token('accent'), token('base')),
      'base/accent': ratio(token('base'), token('accent')),
    };
    return {
      accentToken,
      tokenRatios,
      body,
      linkColour,
      linkRatio: linkColour ? ratio(linkColour, body) : null,
      buttonBackground,
      buttonText,
      buttonRatio: buttonBackground && buttonText ? ratio(buttonText, buttonBackground) : null,
    };
  });
}

test('theme tokens meet WCAG AA in light and dark', async ({ page }) => {
  const pairs = [
    ['text', 'base', 4.5],
    ['text', 'surface', 4.5],
    ['text', 'surface-2', 4.5],
    ['text-muted', 'surface', 4.5],
    ['text-muted', 'base', 4.5],
    // The accent is used as text (links) and as a button background whose text
    // is --color-base, so both directions have to hold.
    ['accent', 'base', 4.5],
    ['accent', 'surface', 4.5],
    ['base', 'accent', 4.5],
  ] as const;
  const failures: string[] = [];

  for (const theme of ['dark', 'light'] as const) {
    // Every accent variant, not just the default.
    for (const accent of ['amber', 'sage', 'magenta', 'cyan']) {
      await applyTheme(page, theme, accent);
      for (const [foreground, background, minimum] of pairs) {
        const ratio = await page.evaluate(
          ({ fg, bg }) => {
            const style = getComputedStyle(document.documentElement);
            const parse = (value: string) => {
              const hex = value.trim();
              const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
              return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
            };
            const channel = (value: number) => {
              const c = value / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
            const a = luminance(parse(style.getPropertyValue(`--color-${fg}`)));
            const b = luminance(parse(style.getPropertyValue(`--color-${bg}`)));
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          },
          { fg: foreground, bg: background },
        );
        if (ratio < minimum) {
          failures.push(`${theme}/${accent}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
        }
      }
    }
  }
  expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
});

test('the system theme follows the OS light/dark choice with AA accents', async ({ page }) => {
  // The most common light-mode case is NOT an explicit data-theme="light": the
  // app resolves 'system' through prefers-color-scheme. The accent fix has to
  // cover that path too, measured on the computed colours of real elements.
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const accent of ['amber', 'sage', 'magenta', 'cyan']) {
      await applyTheme(page, 'system', accent);
      const measured = await measureComputedContrast(page);
      if (!measured.linkColour || measured.linkRatio === null) {
        failures.push(`${scheme}/${accent}: no text-accent element to measure`);
        continue;
      }
      if (measured.linkRatio < 4.5) {
        failures.push(
          `${scheme}/${accent}: text-accent ${measured.linkColour} on ${measured.body} is ${measured.linkRatio.toFixed(2)}:1 (token ${measured.accentToken})`,
        );
      }
      if (measured.buttonRatio === null) {
        failures.push(`${scheme}/${accent}: no primary button to measure`);
      } else if (measured.buttonRatio < 4.5) {
        failures.push(
          `${scheme}/${accent}: primary button text ${measured.buttonText} on ${measured.buttonBackground} is ${measured.buttonRatio.toFixed(2)}:1`,
        );
      }
    }
  }
  expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
});

test('high contrast reaches AAA text and AA accents in both themes', async ({ page }) => {
  // High contrast is a settings boolean applied as data-contrast="high"; the
  // numbers are checked through the OS-driven System path as well as the
  // explicit ones, because that is the common light-mode case.
  const failures: string[] = [];
  const TEXT = 7; // AAA for body text
  const ACCENT = 4.5; // AA for the accent as text and behind button text
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const theme of ['system', 'light', 'dark'] as const) {
      for (const accent of ['amber', 'sage', 'magenta', 'cyan']) {
        await applyTheme(page, theme, accent, true);
        const measured = await measureComputedContrast(page);
        for (const [pair, ratio] of Object.entries(measured.tokenRatios)) {
          const minimum = pair.startsWith('text') ? TEXT : ACCENT;
          if (ratio < minimum) {
            failures.push(`${scheme}/${theme}/${accent}: ${pair} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
          }
        }
        if (measured.linkRatio !== null && measured.linkRatio < ACCENT) {
          failures.push(`${scheme}/${theme}/${accent}: text-accent element is ${measured.linkRatio.toFixed(2)}:1`);
        }
        if (measured.buttonRatio !== null && measured.buttonRatio < ACCENT) {
          failures.push(`${scheme}/${theme}/${accent}: primary button is ${measured.buttonRatio.toFixed(2)}:1`);
        }
      }
    }
  }
  expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
});

test('the dense year grid has a readable text alternative', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/insights');
  // The visualisation is not the only way to read the year: a summary line in
  // words, plus a table a screen reader can walk month by month.
  await expect(page.getByText(/\d+ sessions? this year/)).toBeVisible();
  await expect(page.getByRole('table', { name: /practice by month/i })).toBeAttached();
  // And the grid itself stays out of the tab order: 371 stops is not navigation.
  const tabbableCells = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('[data-a11y-exempt="dense-grid"]')).filter(
        (cell) => (cell as HTMLElement).tabIndex >= 0,
      ).length,
  );
  expect(tabbableCells).toBe(0);
});

test('focus is visible on every route', async ({ page }) => {
  const failures: string[] = [];
  await enableTaskInbox(page);
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { none: true, element: 'body' };
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') > 0;
      const shadow = style.boxShadow !== 'none' && style.boxShadow !== '';
      return {
        none: false,
        element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
        ok: outline || shadow,
      };
    });
    if (state.none) failures.push(`${route}: Tab focused nothing`);
    else if (!('ok' in state) || !state.ok) failures.push(`${route}: no visible focus on ${state.element}`);
  }
  expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
});

test('reduced motion stops CSS animation and the modal slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enableTaskInbox(page);
  await page.goto('/');
  await page.waitForTimeout(200);

  const running = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el);
      const animation = style.animationName !== 'none' && parseFloat(style.animationDuration || '0') > 0;
      const transition = parseFloat(style.transitionDuration || '0') > 0;
      if (animation || transition) {
        offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/)[0]}` : ''}`);
      }
    }
    return offenders.slice(0, 10);
  });
  expect(running, `animation/transition still running under reduced motion: ${running.join(', ')}`).toEqual([]);

  // The modal is the one place motion/react animates a transform; with reduced
  // motion it must be in place immediately, not slide in.
  await page.goto('/inbox');
  const add = page.getByLabel('Add a task');
  await add.fill('a task for the reduced-motion check');
  const modalButton = page.getByRole('button', { name: 'Capture a task' });
  if ((await modalButton.count()) > 0) {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // motion/react still paints its initial keyframe for a frame; what reduced
    // motion must remove is the SLIDE, so the panel is in place two frames later
    // (a spring would still be mid-flight without MotionConfig reducedMotion).
    const transform = await dialog.evaluate(async (el) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return getComputedStyle(el as HTMLElement).transform;
    });
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  }
});
