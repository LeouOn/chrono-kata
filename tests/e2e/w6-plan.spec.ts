import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function setWakingHours(page: Page, start: string, end: string) {
  await enableTaskInbox(page);
  await page.getByLabel('Awake from').fill(start);
  await page.getByLabel('Awake until').fill(end);
  await page.waitForTimeout(200);
}

async function captureAndPromote(page: Page, title: string) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill(`${title} ~20m`);
  await field.press('Enter');
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: 'Process' }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await dialog.getByRole('button', { name: /2: Next action/i }).click();
  await page.getByLabel('The next small step').fill(`start on ${title}`);
  await page.getByRole('button', { name: 'Save next action' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

test('plan, confirm, reload, see it on Home and start a linked session', async ({ page }) => {
  await setWakingHours(page, '09:00', '17:00');
  await captureAndPromote(page, 'write the report');
  await captureAndPromote(page, 'buy paint');
  await captureAndPromote(page, 'call bank');
  await captureAndPromote(page, 'file taxes');

  await page.goto('/plan');
  await expect(page.getByText(/You have \d+ minutes for picks today/)).toBeVisible();
  await expect(page.getByText(/Suggested for today/)).toBeVisible();
  await expect(page.getByText('write the report', { exact: true })).toBeVisible();
  await expect(page.getByText('buy paint', { exact: true })).toBeVisible();
  await expect(page.getByText(/fits the \d+ minutes/).first()).toBeVisible();

  // Swap the first pick for the one next task outside the three suggestions.
  // Which title that is depends on the deterministic ranking, so read it from
  // the select rather than assuming.
  const swap = page.getByLabel(/Swap for another task/).first();
  const swapLabels = (await swap.locator('option').allTextContents()).slice(1);
  expect(swapLabels).toHaveLength(1);
  await swap.selectOption({ label: swapLabels[0]! });
  await page.getByRole('button', { name: /Confirm today|Update today/i }).click();
  await expect(page.getByText('Your picks')).toBeVisible();

  // Reopening shows the confirmed plan, not a fresh suggestion list.
  await page.reload();
  await expect(page.getByText('Your picks')).toBeVisible();
  await expect(page.getByRole('button', { name: /Update today’s plan/i })).toBeVisible();

  // Home shows the Today card with the picks, and Start opens the linked form.
  await page.goto('/');
  await expect(page.getByText("Today's plan")).toBeVisible();
  const start = page.getByRole('button', { name: /Start a session for/ }).first();
  await start.click();
  const form = page.getByRole('dialog', { name: /New session/i });
  await expect(form).toBeVisible();
  await expect(page.getByLabel('Working on (optional)')).toHaveValue(/task:/);

  // Finish that linked session with progress + breadcrumb.
  await page.getByRole('button', { name: /^Good$/ }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByLabel(/Pick up here next time/).fill('carry on with the intro');
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText(/Room for \d+ minutes today/)).toBeVisible();
});

test('an over-capacity plan says so calmly and still saves', async ({ page }) => {
  await setWakingHours(page, '09:00', '09:30');
  await captureAndPromote(page, 'first task');
  await captureAndPromote(page, 'second task');

  await page.goto('/plan');
  await expect(page.getByRole('status')).toContainText(/more than the \d+ you have today/);
  await expect(page.getByRole('status')).not.toContainText(/overdue|late|behind|missed/i);

  await page.getByRole('button', { name: /Confirm today|Update today/i }).click();
  await expect(page.getByText('Your picks')).toBeVisible();
});

test('flag off: Home is the practice home and /plan says it is a preview', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText("Today's plan")).toHaveCount(0);
  await page.goto('/plan');
  await expect(page.getByText(/Planning is a preview feature/)).toBeVisible();
});
