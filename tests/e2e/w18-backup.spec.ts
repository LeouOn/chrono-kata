import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../unit/data-transfer/oracle/dataset';
import { backupTextOf, primaryKeys } from '../unit/data-transfer/oracle/harness';

/**
 * Wave 18 part 2, in a real browser: the import preview, merge and replace, refusing a file that is not a
 * backup, keeping a day whose shutdown time is damaged. The headline test is the wave's own sentence:
 * export, wipe (a brand-new browser profile), import, export again, and the two exports are the same.
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
  await expect(page.getByText(/Importing shows you what will change first/)).toBeVisible();
}

async function chooseFile(page: Page, name: string, text: string) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text, 'utf8'),
  });
}

async function exportJson(page: Page): Promise<Record<string, unknown>> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  const file = JSON.parse(text) as Record<string, unknown>;
  delete file.exportedAt; // the one field that is meant to differ
  return file;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

async function expectTouchTargets(page: Page, scope: ReturnType<Page['locator']>) {
  await scope.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const targets = scope.locator('label:has(input[type="radio"]), button');
  const count = await targets.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < count; i += 1) {
    const box = await targets.nth(i).boundingBox();
    expect(box!.height, `target ${i} is under 44px`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, `target ${i} runs off the screen`).toBeLessThanOrEqual(PHONE.width);
  }
}

/** A realistic backup: every table, every optional field, taskInbox on in its settings. */
function craftedBackup(seed = 1801, tweak: (file: Record<string, unknown>) => void = () => undefined): string {
  return backupTextOf(buildDataset(seed, 'full', primaryKeys()), (file) => {
    const settings = file.settings as { flags?: Record<string, boolean> };
    settings.flags = { ...(settings.flags ?? {}), taskInbox: true };
    tweak(file);
  });
}

test('export, wipe, import, export again: the two exports are the same, in a real browser', async ({ browser }) => {
  // 1. A device with data: bring a backup in by adding what is missing.
  const first = await newDevice(browser);
  await enableTaskInbox(first);
  await chooseFile(first, 'first.json', craftedBackup());
  const preview = first.getByTestId('import-preview');
  await expect(preview.getByRole('heading', { name: 'This backup' })).toBeVisible();
  await expect(preview.getByRole('radio', { name: 'Add what is missing' })).toBeChecked();
  await expect(preview.getByText(/This will add .* to this device\./)).toBeVisible();
  await noHorizontalScroll(first);
  await expectTouchTargets(first, preview);
  await preview.getByRole('button', { name: 'Add what is missing' }).click();
  await expect(first.getByTestId('backup-outcome')).toContainText(/^Added /);
  await expect(preview).toBeHidden();
  const exportedFirst = await exportJson(first);
  expect((exportedFirst.tasks as unknown[]).length).toBeGreaterThan(5);
  await expect(first.getByTestId('backup-outcome')).toContainText(/^Saved \d+ sessions? and the rest of your data\./);

  // 2. The wipe: a brand-new browser profile has none of it. Replace everything with the first export.
  const second = await newDevice(browser);
  await enableTaskInbox(second);
  await chooseFile(second, 'second.json', JSON.stringify({ ...exportedFirst, exportedAt: new Date().toISOString() }));
  const preview2 = second.getByTestId('import-preview');
  await expect(preview2.getByText(/It holds .*tasks/)).toBeVisible();
  await preview2.getByRole('radio', { name: 'Replace everything on this device' }).check();
  await expect(preview2.getByText(/This will replace .* on this device with .* from the file\./)).toBeVisible();
  await noHorizontalScroll(second);
  await preview2.getByRole('button', { name: 'Replace everything…' }).click();
  const dialog = second.getByRole('dialog');
  await expect(dialog.getByText(/It can't be undone\./)).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace everything' }).click();
  await expect(second.getByTestId('backup-outcome')).toContainText(/^Restored .* from the file\./);

  // 3. The wave's sentence.
  const exportedSecond = await exportJson(second);
  expect(exportedSecond).toEqual(exportedFirst);
});

test('a file that is not a backup is refused calmly and changes nothing', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await chooseFile(page, 'data.json', craftedBackup(1802));
  await page.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);
  const before = await exportJson(page);

  const outcome = page.getByTestId('backup-outcome');
  await chooseFile(page, 'notes.json', 'MY-PRIVATE-NOTE {');
  await expect(outcome).toHaveText("This file isn't valid JSON. Nothing on this device was changed.");
  await chooseFile(page, 'evil.json', '{"version":2,"sessions":[],"__proto__":{"polluted":true}}');
  await expect(outcome).toContainText('entries that a backup never has, so it was not read. Nothing on this device was changed.');
  await expect(page.getByTestId('import-preview')).toBeHidden();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => ({} as Record<string, unknown>).polluted)).toBeUndefined();
  await noHorizontalScroll(page);

  expect(await exportJson(page)).toEqual(before);
});

test('a day whose shutdown time is damaged keeps its journal, and the preview says it was repaired', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  const text = craftedBackup(1803, (file) => {
    const plan = (file.dayPlans as Record<string, unknown>[])[0]!;
    plan.journal = 'my own words that I cannot retype';
    plan.shutdownAt = 'not-a-date';
  });
  await chooseFile(page, 'damaged.json', text);
  const preview = page.getByTestId('import-preview');
  await expect(preview.getByText(/1 record had a date that could not be read, so it comes back without it: 1 day plan\./)).toBeVisible();
  await expect(preview.getByText(/could not be read, so it is skipped/)).toBeHidden(); // repaired, not skipped
  await preview.getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByTestId('backup-outcome')).toContainText(/^Added /);

  const exported = await exportJson(page);
  const plans = exported.dayPlans as Record<string, unknown>[];
  const kept = plans.find((p) => p.journal === 'my own words that I cannot retype');
  expect(kept, 'the day with the damaged shutdown time was kept').toBeDefined();
  expect(kept!.shutdownAt).toBeUndefined();
});

test('with the preview flag off the card is the old one', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto('/settings');
  await expect(page.getByText(/Importing replaces ALL local data/)).toBeVisible();
  await chooseFile(page, 'old.json', craftedBackup(1804));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Replace all data?')).toBeVisible();
  await expect(page.getByTestId('import-preview')).toBeHidden();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
