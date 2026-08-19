import { test, expect } from '@playwright/test';

test.describe('Onboarding & Navigation', () => {
  test('redirects to /onboarding on first visit and completes onboarding', async ({ page }) => {
    // Clear localStorage to simulate a new user
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/');
    await expect(page).toHaveURL(/.*onboarding/);
    await expect(page.getByRole('heading', { name: 'Welcome.' })).toBeVisible();

    // Select Zen personality
    const zenCard = page.getByRole('button', { name: /Zen/i });
    await expect(zenCard).toBeVisible();
    await zenCard.click();

    // Should redirect to home page
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('navigates through tab bar routes', async ({ page }) => {
    // Mark onboarding as completed
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });

    await page.goto('/');

    // Navigate to Sessions
    await page.getByRole('link', { name: /sessions/i }).click();
    await expect(page).toHaveURL(/.*sessions/);

    // Navigate to Insights
    await page.getByRole('link', { name: /insights/i }).click();
    await expect(page).toHaveURL(/.*insights/);

    // Navigate to Settings
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL(/.*settings/);
  });
});
