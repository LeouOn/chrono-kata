import { expect, test } from '@playwright/test';

test('a reload keeps a running session timer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-completed', 'true');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.evaluate(() => {
    const raw = localStorage.getItem('chrono-kata-session-timer');
    if (!raw) throw new Error('timer draft missing');
    const draft = JSON.parse(raw) as { startedAtMs: number };
    draft.startedAtMs = Date.now() - 65_000;
    localStorage.setItem('chrono-kata-session-timer', JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /New session/i })).toBeVisible();
  await expect(page.getByText(/01:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
});
