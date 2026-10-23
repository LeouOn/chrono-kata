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

async function captureTask(page: Page, text: string, title: string) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill(text);
  await field.press('Enter');
  await expect(page.getByText(title)).toBeVisible();
}

test('a linked session records outcome, breadcrumb and actual minutes, and survives a reload', async ({ page }) => {
  await enableTaskInbox(page);
  await captureTask(page, 'write the report ~20m', 'write the report');

  // Start from the inbox row, not the FAB.
  await page.getByRole('button', { name: 'Start a session for write the report' }).click();
  const form = page.getByRole('dialog', { name: /New session/i });
  await expect(form).toBeVisible();
  await expect(page.getByLabel('Working on (optional)')).toHaveValue(/task:/);
  await expect(page.getByText('20 min')).toBeVisible();

  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByLabel(/Pick up here next time/).fill('finish the intro paragraph');
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(form).toBeHidden();

  // The breadcrumb and the logged minutes show on the task.
  await page.goto('/inbox');
  await expect(page.getByText('Pick up here:')).toBeVisible();
  await expect(page.getByText('finish the intro paragraph')).toBeVisible();
  await expect(page.getByText('20m logged')).toBeVisible();

  await page.reload();
  await expect(page.getByText('finish the intro paragraph')).toBeVisible();

  // Second session, outcome done: the task leaves the inbox.
  await page.getByRole('button', { name: 'Start a session for write the report' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel(/Pick up here next time/).fill('wrapped up');
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(page.getByRole('dialog', { name: /New session/i })).toBeHidden();
  await expect(page.getByText('write the report')).toHaveCount(0);
});

test('a project-linked session requires a pick-up note and says so', async ({ page }) => {
  await enableTaskInbox(page);
  await captureTask(page, 'plan the move', 'plan the move');

  // Make a project from the captured task through process mode.
  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Process' }).click();
  await page.getByRole('button', { name: /6: Make project/i }).click();
  await page.getByRole('button', { name: 'Make project', exact: true }).click();
  const processDialog = page.getByRole('dialog', { name: 'Process inbox' });
  await expect(processDialog.getByText('Inbox is clear.')).toBeVisible();
  await processDialog.getByRole('button', { name: 'Close' }).click();

  // Start a session from the FAB and pick the project.
  await page.goto('/');
  await page.getByRole('button', { name: 'New session' }).click();
  const picker = page.getByLabel('Working on (optional)');
  // Options: 0 = no link, 1 = the task, 2 = the project created from it (same title).
  await picker.selectOption({ index: 2 });
  await expect(picker).toHaveValue(/project:/);
  await page.getByLabel('Minutes').fill('10');
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(page.getByText(/Add a pick-up note for this project/)).toBeVisible();

  // Giving it a note saves.
  await page.getByLabel(/Pick up here next time/).fill('start with the boxes');
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(page.getByRole('dialog', { name: /New session/i })).toBeHidden();
});

test('with the flag off the session form is the practice form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New session' }).click();
  const form = page.getByRole('dialog', { name: /New session/i });
  await expect(form).toBeVisible();
  await expect(page.getByLabel('Working on (optional)')).toHaveCount(0);
  await expect(page.getByText('How did it end?')).toHaveCount(0);
  await expect(page.getByText(/Pick up here next time/)).toHaveCount(0);
});
