import { test, expect } from '@playwright/test';

test.describe('Athena Secret Mode & 7-Tap Easter Egg', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('unlocks Athena Prajñāpāramitā via 7 rapid flame taps and selects it in settings', async ({ page }) => {
    // The flame now lives inside TodaySummary, which only renders once there is a
    // session today or a non-zero streak (decluttered home, 0aa0543). Log one
    // short session so the summary — and the flame the easter egg hangs off — exists.
    await page.goto('/sessions');
    await page.getByRole('button', { name: /\+ New/i }).click();
    await expect(page.getByRole('heading', { name: /New session/i })).toBeVisible();
    const durationInput = page.locator('input[type="number"]');
    if (await durationInput.isVisible()) {
      await durationInput.fill('10');
    }
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await page.getByRole('button', { name: /Save session/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

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
    await expect(page.getByText(/A new voice is available in your coach picker/i)).toBeVisible();

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

    // Verify selection is set. Assert the "Active coach" value, not any text
    // containing "athena": once selected, the button ("athena ✦") and this
    // value both match, which is a strict-mode violation.
    const activeCoach = page.getByText('Active coach').locator('xpath=following-sibling::div[1]');
    await expect(activeCoach).toHaveText('athena');
  });
});
