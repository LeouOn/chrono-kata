import { test, expect } from '@playwright/test';

test.describe('Conversation Thread & Power Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding-completed', 'true');
    });
  });

  test('creates a session and interacts with conversation thread UI', async ({ page }) => {
    await page.goto('/sessions');

    // Create session
    await page.getByRole('button', { name: /\+ New/i }).click();
    const durationInput = page.locator('input[type="number"]');
    if (await durationInput.isVisible()) {
      await durationInput.fill('15');
    }
    const labelInput = page.getByPlaceholder(/e\.g\. meditation/i);
    if (await labelInput.isVisible()) {
      await labelInput.fill('Kata Practice');
    }

    // Pick rating 4
    await page.getByRole('button', { name: '4', exact: true }).click();

    await page.getByRole('button', { name: /Save session/i }).click();

    // Navigate to session detail
    await page.getByText('Kata Practice').first().click();
    await expect(page).toHaveURL(/.*sessions\/.+/);

    // Verify follow-up input bar and mid-chat overrides toggle
    const toggleOverridesBtn = page.getByRole('button', { name: /Toggle model controls/i });
    await expect(toggleOverridesBtn).toBeVisible();
    await toggleOverridesBtn.click();

    // Verify mid-chat override drawer is visible
    await expect(page.getByText('Mid-Chat Overrides')).toBeVisible();
    await expect(page.getByText('Coach Personality')).toBeVisible();
    await expect(page.getByText('LLM Provider')).toBeVisible();

    // Close override drawer
    await page.getByRole('button', { name: /Hide/i }).click();

    // Verify Export menu dropdown
    const exportBtn = page.getByRole('button', { name: /Export/i });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    await expect(page.getByText('Copy Markdown')).toBeVisible();
    await expect(page.getByText('Download (.md)')).toBeVisible();
    await expect(page.getByText('Download (.json)')).toBeVisible();
  });
});
