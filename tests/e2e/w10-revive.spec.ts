import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Wave 10 part 3: the gentle offer for a project that has gone quiet, and the
 * ten-minute session. The project is made the way a person makes it (capture,
 * make project); it is then LEFT QUIET by moving only its last-touched time back,
 * which is exactly what weeks of not touching it look like.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = '/tmp/qa-w10-shots';
const GUILT = /\b(overdue|late|behind|missed|failed|dropped|abandoned|neglected|stalled)\b/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function makeProject(page: Page, text: string, title: string) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill(text);
  await field.press('Enter');
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole('button', { name: 'Process' }).click();
  await page.getByRole('button', { name: /6: Make project/i }).click();
  await page.getByRole('button', { name: 'Make project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await expect(dialog.getByText('Inbox is clear.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

/** Move every project's last-touched time back, as weeks of not touching it would. */
async function goQuiet(page: Page, daysAgo: number) {
  await page.evaluate((days) => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('chrono-kata');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const all = store.getAll();
        all.onsuccess = () => {
          for (const row of all.result) store.put({ ...row, lastTouchedAt: new Date(Date.now() - days * 86_400_000) });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, daysAgo);
}

async function reachable(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, 'control has a box').not.toBeNull();
  expect(box!.height, 'at least 44px tall').toBeGreaterThanOrEqual(44);
  const hit = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top !== null && (el === top || el.contains(top));
  });
  expect(hit, 'nothing is drawn over the control').toBe(true);
}

const OFFER = "Whenever you're ready";

test('a quiet project is offered calmly; ten minutes and a note bring it back', async ({ page }) => {
  await enableTaskInbox(page);
  await makeProject(page, 'sketch the opening ~25m', 'sketch the opening');
  await goQuiet(page, 20);

  // Home: one calm card.
  await page.goto('/');
  const heading = page.getByRole('heading', { name: OFFER });
  await expect(heading).toBeVisible();
  const card = heading.locator('..');
  await expect(card.getByText('sketch the opening', { exact: true })).toBeVisible();
  await expect(card.getByText(/Worked on 2 weeks ago\. Ten minutes is enough to keep it going\./)).toBeVisible();
  expect(await card.innerText()).not.toMatch(GUILT);
  const start = card.getByRole('button', { name: /^Start 10 minutes/ });
  for (const control of [start, card.getByRole('button', { name: 'Not now' }), card.getByRole('link', { name: 'Open project' })]) {
    await reachable(control);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll at 390px').toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/revive-card.png` });

  // Start 10 minutes: the ordinary session form, linked to the project, ten minutes.
  await start.click();
  const form = page.getByRole('dialog', { name: /New session/i });
  await expect(form).toBeVisible();
  await expect(page.getByLabel('Working on (optional)')).toHaveValue(/project:/);
  await expect(page.getByText('10 min')).toBeVisible();

  // A project session needs its pick-up note: saving without one writes nothing and says so.
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(form).toBeVisible();
  await page.getByLabel(/Pick up here next time/).fill('write the first line of the scene');
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(form).toBeHidden();

  // The project is touched, so it is no longer offered; its page shows the session.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Today's plan" })).toBeVisible();
  await expect(page.getByRole('heading', { name: OFFER })).toHaveCount(0);
  await page.goto('/projects');
  await page.getByRole('link', { name: /sketch the opening/ }).click();
  await expect(page.getByText('Pick up here: write the first line of the scene')).toBeVisible();
  await expect(page.getByText('Worked on today').first()).toBeVisible();
});

test('"Not now" is respected: gone for the day, and after a reload', async ({ page }) => {
  await enableTaskInbox(page);
  await makeProject(page, 'sketch the opening ~25m', 'sketch the opening');
  await goQuiet(page, 20);

  await page.goto('/');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: OFFER })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: "Today's plan" })).toBeVisible();
  await expect(page.getByRole('heading', { name: OFFER })).toHaveCount(0);
  // The plan screen shows the same restraint.
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Your day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: OFFER })).toHaveCount(0);
});

test('the project page offers the same ten minutes any time, quiet or not', async ({ page }) => {
  await enableTaskInbox(page);
  await makeProject(page, 'sketch the opening ~25m', 'sketch the opening');

  await page.goto('/projects');
  await page.getByRole('link', { name: /sketch the opening/ }).click();
  const button = page.getByRole('button', { name: /^Start a 10-minute session/ });
  await reachable(button);
  await button.click();
  await expect(page.getByRole('dialog', { name: /New session/i })).toBeVisible();
  await expect(page.getByLabel('Working on (optional)')).toHaveValue(/project:/);
  await expect(page.getByText('10 min')).toBeVisible();
});

test('with the preview flag off there is no offer at all', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Today's plan" })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: OFFER })).toHaveCount(0);
});
