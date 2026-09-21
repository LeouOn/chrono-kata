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

    // Pick rating 4
    await page.getByRole('button', { name: '4', exact: true }).click();

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
    await expect(page.getByText('Calm and focused meditation session.').first()).toBeVisible();
  });

  test('warns before discarding a running timer on backdrop tap', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New session' }).click();
    await page.getByRole('button', { name: /^start$/i }).click();

    // Tap the backdrop above the bottom sheet.
    await page.mouse.click(10, 100);

    await expect(page.getByText('Discard unsaved practice?')).toBeVisible();
    await page.getByRole('button', { name: /keep editing/i }).click();
    await expect(page.getByText('Discard unsaved practice?')).toBeHidden();

    // Form (and timer) still open.
    await expect(page.getByRole('heading', { name: /new session/i })).toBeVisible();

    // Discard via Cancel -> confirm.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await page.getByRole('button', { name: /discard practice/i }).click();
    await expect(page.getByRole('heading', { name: /new session/i })).toBeHidden();
  });
});
