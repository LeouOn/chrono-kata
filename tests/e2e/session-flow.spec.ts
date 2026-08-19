import { test, expect } from '@playwright/test';

test.describe('Session Logging Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('logs a new timed practice session and views details', async ({ page }) => {
    await page.goto('/sessions');

    // Open new session modal
    await page.getByRole('button', { name: /\+ New/i }).click();
    await expect(page.getByRole('heading', { name: /New session/i })).toBeVisible();

    // Fill in duration if manual or timer
    const durationInput = page.locator('input[type="number"]');
    if (await durationInput.isVisible()) {
      await durationInput.fill('20');
    }

    // Fill activity label
    const labelInput = page.getByPlaceholder(/e\.g\. meditation/i);
    if (await labelInput.isVisible()) {
      await labelInput.fill('Mindfulness Practice');
    }

    // Fill note
    const noteInput = page.getByPlaceholder(/what did you practice/i);
    if (await noteInput.isVisible()) {
      await noteInput.fill('Calm and focused meditation session.');
    }

    // Submit session
    const saveButton = page.getByRole('button', { name: /Save session/i });
    await saveButton.click();

    // Verify session card appears on sessions list
    await expect(page.getByText('Mindfulness Practice')).toBeVisible();

    // Click on session to view detail
    await page.getByText('Mindfulness Practice').click();
    await expect(page).toHaveURL(/.*sessions\/.+/);
    await expect(page.getByText('Calm and focused meditation session.')).toBeVisible();
  });
});
