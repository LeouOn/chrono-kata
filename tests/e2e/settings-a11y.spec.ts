import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function openSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

test('the habit dialog exposes every field by label', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /Add Habit/i }).click();
  const dialog = page.getByRole('dialog', { name: /New Habit/i });
  await expect(dialog).toBeVisible();

  await expect(page.getByLabel('Icon')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Kind' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByLabel('Link to sessions (optional)')).toBeVisible();

  await page.getByRole('button', { name: /Timed/i }).click();
  await expect(page.getByLabel('Daily target (minutes)')).toBeVisible();

  await page.getByRole('button', { name: /Count/i }).click();
  await expect(page.getByLabel('Daily target (units)')).toBeVisible();
  await expect(page.getByLabel('Unit', { exact: true })).toBeVisible();

  await page.getByLabel('Link to sessions (optional)').selectOption('custom');
  await expect(page.getByLabel('Custom activity label')).toBeVisible();
});

test('the kata dialog exposes every field by label', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /Add Kata/i }).click();
  const dialog = page.getByRole('dialog', { name: /New Kata Preset/i });
  await expect(dialog).toBeVisible();

  await expect(page.getByRole('group', { name: 'Icon' })).toBeVisible();
  await expect(page.getByLabel('Routine Name')).toBeVisible();
  await expect(page.getByLabel('Default Duration (minutes)')).toBeVisible();
  await expect(page.getByLabel('Soft cap (minutes, optional)')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Intensity' })).toBeVisible();
  await expect(page.getByLabel('Activity Label (optional)')).toBeVisible();
  await expect(page.getByLabel('Default Note (optional)')).toBeVisible();

  await page.getByRole('button', { name: /Reps/i }).click();
  await expect(page.getByLabel('Default Repetitions')).toBeVisible();
});
