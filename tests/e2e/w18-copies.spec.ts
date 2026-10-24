import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../unit/data-transfer/oracle/dataset';
import { backupTextOf, primaryKeys } from '../unit/data-transfer/oracle/harness';

/**
 * Wave 18 part 4, in a real browser: automatic copies on this device. Make a copy, wreck the data, restore
 * from the copy through the same preview as any import, and the export is the one from before. A copy is
 * made on its own when the browser is idle; Clear all data removes the copies; nothing happens with the
 * flag off.
 */
const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: PHONE, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
  return context.newPage();
}

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Copies on this device')).toBeVisible();
}

function crafted(seed: number): string {
  return backupTextOf(buildDataset(seed, 'full', primaryKeys()), (file) => {
    const settings = file.settings as { flags?: Record<string, boolean> };
    settings.flags = { ...(settings.flags ?? {}), taskInbox: true };
    // (A generated streak would throw a milestone celebration over the page when it is restored.)
    (file.streak as Record<string, unknown>).milestonesAchieved = [];
  });
}

async function chooseFile(page: Page, name: string, text: string) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
}

async function exportJson(page: Page): Promise<Record<string, unknown>> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8')) as Record<string, unknown>;
  delete file.exportedAt;
  return file;
}

/** The copies database, read directly from the page (it is a database of its own). */
async function copyCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('chrono-kata-copies');
        open.onerror = () => resolve(-1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('copies')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('copies').objectStore('copies').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => {
            db.close();
            resolve(-1);
          };
        };
      }),
  );
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

test('make a copy, wreck the data, restore from the copy: the export is the one from before', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await chooseFile(page, 'one.json', crafted(1820));
  await page.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);
  const before = await exportJson(page);
  expect((before.tasks as unknown[]).length).toBeGreaterThan(5);

  await page.getByRole('button', { name: 'Make a copy now' }).click();
  await expect(page.getByTestId('copies-message')).toHaveText('Made a copy of everything on this device.');
  await expect(page.getByTestId('last-copy')).toHaveText('Last copy: today.');

  // A bad import: everything replaced by something else. A safety copy of the replaced state is made first.
  await chooseFile(page, 'two.json', crafted(1821));
  const replacing = page.getByTestId('import-preview');
  await replacing.getByRole('radio', { name: 'Replace everything on this device' }).check();
  await replacing.getByRole('button', { name: 'Replace everything…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace everything' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Restored /);
  expect(await exportJson(page)).not.toEqual(before);
  await expect(page.getByTestId('copy-item')).toHaveCount(2);
  await expect(page.getByTestId('copy-item').first()).toContainText('made just before an import');

  // Restore the copy made earlier: the OLDER item in the list.
  const manual = page.getByTestId('copy-item').filter({ hasText: 'made by you' });
  await manual.getByRole('button', { name: /^Look at the copy from / }).click();
  const restore = page.getByTestId('import-preview');
  await expect(restore.getByRole('heading', { name: 'This backup' })).toBeVisible();
  await noHorizontalScroll(page);
  await restore.getByRole('radio', { name: 'Replace everything on this device' }).check();
  await restore.getByRole('button', { name: 'Replace everything…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace everything' }).click();
  await expect(page.getByTestId('copies-message')).toContainText(/^Restored .* \(from the copy of /);

  expect(await exportJson(page)).toEqual(before);
  await expect(page.getByTestId('copy-item')).toHaveCount(3); // and the state it replaced was kept too
});

test('the card fits a phone: the limit is said plainly, targets are at least 44px, nothing scrolls sideways', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await chooseFile(page, 'one.json', crafted(1822));
  await page.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);
  await page.getByRole('button', { name: 'Make a copy now' }).click();
  const card = page.locator('div:has(> div:text-is("Copies on this device"))').first();
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(card.getByText(/not from the browser clearing its storage\. Save a file as well\./)).toBeVisible();
  await noHorizontalScroll(page);
  const targets = card.locator('button, select');
  const count = await targets.count();
  expect(count).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < count; i += 1) {
    const box = await targets.nth(i).boundingBox();
    expect(box!.height, `target ${i} is under 44px`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, `target ${i} runs off the screen`).toBeLessThanOrEqual(PHONE.width);
  }
});

test('the browser makes the day\'s copy by itself when idle, once', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await chooseFile(page, 'one.json', crafted(1823));
  await page.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);
  // The safety copy before that import was skipped (the device was empty); now open the app afresh.
  expect(await copyCount(page)).toBe(0);
  await page.goto('/');
  await expect.poll(() => copyCount(page), { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(1);
  await page.reload();
  await page.waitForTimeout(3000);
  expect(await copyCount(page)).toBe(1); // a second open the same day does not make a second copy
  await page.goto('/settings');
  await expect(page.getByTestId('copy-item')).toHaveCount(1);
  await expect(page.getByTestId('copy-item')).toContainText('made automatically');
});

test('Clear all data removes the copies too', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await chooseFile(page, 'one.json', crafted(1824));
  await page.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);
  await page.getByRole('button', { name: 'Make a copy now' }).click();
  await expect(page.getByTestId('copy-item')).toHaveCount(1);
  expect(await copyCount(page)).toBe(1);

  await page.getByRole('button', { name: 'Clear all data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Wipe everything' }).click();
  await page.waitForLoadState('load');
  await expect.poll(async () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).includes('chrono-kata-copies'))).toBe(false);
  await page.goto('/settings');
  await expect(page.getByText('Copies on this device')).toBeHidden(); // the flag went with the data
});

test('with the preview flag off there is no card and no copies database', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto('/settings');
  await expect(page.getByText('Data', { exact: true })).toBeVisible();
  await expect(page.getByText('Copies on this device')).toBeHidden();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).includes('chrono-kata-copies'))).toBe(false);
});
