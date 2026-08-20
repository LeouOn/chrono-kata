import { test, expect } from '@playwright/test';

test.describe('Settings & Appearance', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('switches theme, accent color, and rating style', async ({ page }) => {
    await page.goto('/settings');

    // Verify settings heading
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Switch theme to Dark
    const darkThemeBtn = page.getByRole('button', { name: /Dark/i });
    await expect(darkThemeBtn).toBeVisible();
    await darkThemeBtn.click();

    // Switch accent color to Sage
    const sageBtn = page.getByRole('button', { name: /Sage/i });
    await expect(sageBtn).toBeVisible();
    await sageBtn.click();

    // Switch rating picker style to Dots
    const dotsBtn = page.getByRole('button', { name: /Dots/i });
    await expect(dotsBtn).toBeVisible();
    await dotsBtn.click();
  });

  test('navigates to LLM settings and verifies provider presets', async ({ page }) => {
    await page.goto('/llm');

    // Verify LLM heading
    await expect(page.getByRole('heading', { name: /LLM Providers|LLM Settings/i })).toBeVisible();

    // Verify token usage summary card
    await expect(page.getByText(/This month|tokens/i).first()).toBeVisible();
  });
});
