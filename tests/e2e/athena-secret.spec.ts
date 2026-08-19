import { test, expect } from '@playwright/test';

test.describe('Athena Secret Mode & 7-Tap Easter Egg', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('unlocks Athena Prajñāpāramitā via 7 rapid flame taps and selects it in settings', async ({ page }) => {
    await page.goto('/');

    // Locate the streak flame button
    const streakFlame = page.getByRole('button', { name: /day streak/i });
    await expect(streakFlame).toBeVisible();

    // Tap flame 7 times rapidly
    for (let i = 0; i < 7; i++) {
      await streakFlame.click();
    }

    // Verify Athena reveal celebration modal appears
    const revealModal = page.getByRole('dialog', { name: /Athena personality unlocked/i });
    await expect(revealModal).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Athena Prajñāpāramitā' })).toBeVisible();
    await expect(page.getByText(/You have awakened the secret coach voice/i)).toBeVisible();

    // Dismiss reveal overlay by clicking on it
    await revealModal.click();
    await expect(revealModal).toBeHidden();

    // Navigate to Settings
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify Athena is now listed and selectable in coach personality options
    const athenaOption = page.getByRole('button', { name: /Athena/i });
    await expect(athenaOption).toBeVisible();
    await athenaOption.click();

    // Verify selection is persisted
    await expect(athenaOption).toHaveAttribute('aria-pressed', 'true');
  });
});
