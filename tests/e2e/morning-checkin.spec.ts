import { expect, test } from '@playwright/test';

test('morning check-in survives reload and can be edited', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-completed', 'true');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Energy 3', exact: true }).click();
  await page.getByRole('button', { name: 'Fog 2', exact: true }).click();
  await page.getByRole('button', { name: 'Aches 1', exact: true }).click();
  await page.getByRole('button', { name: 'Sleep 4', exact: true }).click();
  await expect(page.getByRole('button', { name: /Energy 3/ })).toContainText('Sleep 4');

  await page.reload();
  const summary = page.getByRole('button', { name: /Energy 3/ });
  await expect(summary).toBeVisible();
  await summary.click();
  await page.getByRole('button', { name: 'Fog 5', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fog 5/ })).toBeVisible();
});
