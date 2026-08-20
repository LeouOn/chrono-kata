import { test, expect } from '@playwright/test';

test.describe('Daily AI Coach Briefing & Yearly Heatmap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('displays Daily Briefing trigger card on home dashboard', async ({ page }) => {
    await page.goto('/');

    // Verify Coach Briefing prompt appears
    await expect(page.getByText(/Coach Briefing/i)).toBeVisible();
    await expect(page.getByText(/Brief me/i)).toBeVisible();
  });

  test('displays Annual Consistency Heatmap on /insights', async ({ page }) => {
    await page.goto('/insights');

    // Verify Annual Consistency card
    await expect(page.getByText('Annual Consistency')).toBeVisible();
    await expect(page.getByText(/days active/i)).toBeVisible();

    // Verify month labels
    await expect(page.getByText('Jan')).toBeVisible();
    await expect(page.getByText('Dec')).toBeVisible();
    await expect(page.getByText('Less')).toBeVisible();
    await expect(page.getByText('More')).toBeVisible();
  });
});
