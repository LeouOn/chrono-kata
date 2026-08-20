import { test, expect } from '@playwright/test';

test.describe('Quick-Start Kata Templates & Practice Audio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('displays Quick-Start Katas on dashboard and opens pre-filled session modal', async ({ page }) => {
    await page.goto('/');

    // Verify Quick Start Katas section appears
    await expect(page.getByText('Quick Start Katas')).toBeVisible();

    // Click on Morning Zazen kata
    const zazenKata = page.getByText('Morning Zazen');
    await expect(zazenKata).toBeVisible();
    await zazenKata.click();

    // Verify SessionForm modal opens pre-filled
    await expect(page.getByRole('heading', { name: /Start Morning Zazen|New session/i })).toBeVisible();
    await expect(page.locator('input[value="Meditation"]')).toBeVisible();
    await expect(page.locator('textarea')).toHaveValue(/Stillness, posture, and breath awareness/i);
  });

  test('creates a custom Kata template in Settings', async ({ page }) => {
    await page.goto('/settings');

    // Verify Practice Katas section in settings
    await expect(page.getByText('Practice Katas')).toBeVisible();

    // Open Add Kata modal
    await page.getByRole('button', { name: /Add Kata/i }).click();
    await expect(page.getByRole('heading', { name: 'New Kata Preset' })).toBeVisible();

    // Fill in template details
    await page.getByPlaceholder('e.g. Morning Zazen').fill('Evening Rest & Recovery');
    await page.getByPlaceholder('e.g. Meditation, Deep Work').fill('Recovery');

    // Save Kata
    await page.getByRole('button', { name: 'Save Kata' }).click();

    // Confirm new Kata appears in settings list
    await expect(page.getByText('Evening Rest & Recovery')).toBeVisible();
  });
});
