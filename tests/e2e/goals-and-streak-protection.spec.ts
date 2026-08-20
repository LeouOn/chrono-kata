import { test, expect } from '@playwright/test';

test.describe('Habit Goals & Streak Protection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('configures practice goals and rest days in settings', async ({ page }) => {
    await page.goto('/settings');

    // Verify Habit Goals section
    await expect(page.getByText('Habit Goals & Streak Protection')).toBeVisible();

    // Select 30m daily target
    const target30m = page.getByRole('button', { name: '30m' });
    await expect(target30m).toBeVisible();
    await target30m.click();
    await expect(page.getByText('30 min / day')).toBeVisible();

    // Select 6 days / week target
    const target6d = page.getByRole('button', { name: '6d' });
    await expect(target6d).toBeVisible();
    await target6d.click();
    await expect(page.getByText('6 days / week')).toBeVisible();

    // Toggle a rest day
    const sunButton = page.getByRole('button', { name: 'SUN Rest Day' });
    if (await sunButton.isVisible()) {
      await sunButton.click();
    }
  });

  test('displays GoalProgressRing on home dashboard', async ({ page }) => {
    await page.goto('/sessions');

    // Log a 15 min session
    await page.getByRole('button', { name: /\+ New/i }).click();
    const durationInput = page.locator('input[type="number"]');
    if (await durationInput.isVisible()) {
      await durationInput.fill('15');
    }
    await page.getByRole('button', { name: /Save session/i }).click();

    // Navigate to Home
    await page.goto('/');

    // Verify TodaySummary card displays progress ring and goal text
    await expect(page.getByText(/Goal \d+m/i)).toBeVisible();
    await expect(page.locator('svg circle')).toHaveCount(2); // Track and progress arc
  });
});
