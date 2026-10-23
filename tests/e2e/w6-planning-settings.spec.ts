import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

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

test('planning settings persist, reject an invalid waking time, and remove anchors', async ({ page }) => {
  await enableTaskInbox(page);

  // Waking hours
  const awakeFrom = page.getByLabel('Awake from');
  await awakeFrom.fill('08:00');
  await page.getByLabel('Awake until').fill('21:00');

  // Add an anchor
  await page.getByRole('button', { name: 'Add window' }).click();
  const dialog = page.getByRole('dialog', { name: /New protected window/i });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Title').fill('Trading session');
  await page.getByRole('button', { name: 'Tue' }).click();
  await page.getByLabel('From', { exact: true }).fill('09:00');
  await page.getByLabel('Until', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Save window' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Trading session')).toBeVisible();

  // Survives a reload
  await page.reload();
  await expect(page.getByLabel('Awake from')).toHaveValue('08:00');
  await expect(page.getByLabel('Awake until')).toHaveValue('21:00');
  await expect(page.getByText('Trading session')).toBeVisible();

  // Clearing a time input must not persist an invalid row (the bug that could
  // silently drop every setting on backup restore).
  await page.getByLabel('Awake from').fill('');
  await page.reload();
  await expect(page.getByLabel('Awake from')).toHaveValue('08:00');

  // Remove through the gentle confirm
  await page.getByRole('button', { name: 'Remove Trading session' }).click();
  const confirm = page.getByRole('dialog', { name: /Remove this window/i });
  await expect(confirm).toContainText('Nothing else changes');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Trading session')).toHaveCount(0);
});

test('the planning section and its fields are absent with the flag off', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Planning (preview)')).toHaveCount(0);
  await expect(page.getByLabel('Awake from')).toHaveCount(0);
});
