import { test, expect, type Page } from '@playwright/test';

/**
 * Wave 20 part 1: a REAL render error, through a realistic path — a corrupt
 * row written straight to IndexedDB (the kind of bad write the integrity
 * checker exists for) that the inbox screen cannot render. The boundary must
 * catch it, the rest of the app must keep working, and the local error log
 * must record it.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** Write a corrupt task row directly to IndexedDB, bypassing every schema. */
async function writeCorruptTask(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('chrono-kata');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('tasks', 'readwrite');
        tx
          .objectStore('tasks')
          .put({
            id: '00000000-0000-4000-8000-000000000bad',
            title: 'corrupt row',
            status: 'inbox',
            source: 'manual',
            // Impossible types for a Task: the screen renders these as Dates.
            createdAt: 'not-a-date',
            touchedAt: 'not-a-date',
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

test('a corrupt row that breaks /inbox shows the boundary; the rest of the app works', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
  await enableTaskInbox(page);
  await writeCorruptTask(page);

  await page.goto('/inbox');
  // Calm copy, no stack trace on screen, 44px actions.
  await expect(page.getByText('Something went wrong on this screen.')).toBeVisible();
  await expect(page.getByText(/Your data is safe on this device/)).toBeVisible();
  await expect(page.getByText(/not-a-date|TypeError|getTime/)).toHaveCount(0);
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // The rest of the app keeps working.
  await page.getByRole('link', { name: 'Go to the Home screen' }).click();
  await expect(page).toHaveURL(/\/$/);

  // And the error was recorded in the local log (Settings viewer).
  await page.goto('/settings');
  const card = page.getByRole('heading', { name: 'Error log' });
  await expect(card).toBeVisible();
  const logList = page.getByRole('list', { name: 'Recorded errors' });
  await expect(logList).toContainText('/inbox');
  await page.screenshot({ path: '/tmp/qa-w20-shots/boundary-and-log.png' });
});
