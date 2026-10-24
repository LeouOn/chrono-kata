import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

/** Turn on the preview flag through Settings, as a user would. */
async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function captureInline(page: Page, text: string) {
  const field = page.getByLabel('Add a task');
  await field.fill(text);
  await field.press('Enter');
}

async function openCaptureSheet(page: Page) {
  // The launcher only mounts once the flag query resolves; waiting for its
  // button also asserts the control exists.
  await expect(page.getByRole('button', { name: 'Capture a task' })).toBeVisible();
  // Ctrl/Cmd+K is the command palette now; capture is one of its commands.
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await expect(palette).toBeVisible();
  await page.getByLabel('Type a command').fill('capture a task');
  await page.getByLabel('Type a command').press('Enter');
  await expect(page.getByRole('dialog', { name: 'Capture' })).toBeVisible();
}

async function pasteLines(page: Page, lines: string[]) {
  await page.getByLabel('Task to capture').click();
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('#capture-input');
    if (!input) throw new Error('capture input not found');
    const data = new DataTransfer();
    data.setData('text/plain', text);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, lines.join('\n'));
}

test('captured item survives a reload', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/inbox');

  await captureInline(page, 'fix hose #life ~20m !high tomorrow @hardware-store');
  await expect(page.getByText('fix hose')).toBeVisible();
  await expect(page.getByText('1 item to sort')).toBeVisible();

  await page.reload();
  await expect(page.getByText('fix hose')).toBeVisible();
  await expect(page.getByText(/\d+ items to sort|1 item to sort/)).toBeVisible();
});

test('Ctrl+K captures a parsed task with visible chips', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/');
  await openCaptureSheet(page);

  const input = page.getByLabel('Task to capture');
  await input.fill('buy paint @shop ~30m');
  await expect(page.getByText('@shop')).toBeVisible();
  await expect(page.getByText('~30m')).toBeVisible();

  await input.press('Enter');
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/inbox');
  await expect(page.getByText('buy paint')).toBeVisible();
});

test('bulk paste previews before saving and can drop a line', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/');
  await openCaptureSheet(page);

  await pasteLines(page, ['- fix hose', '- buy paint @shop', '* call bank']);
  await expect(page.getByText('3 lines found.')).toBeVisible();

  await page.getByRole('button', { name: 'Drop line 3' }).click();
  await page.getByRole('button', { name: 'Add 2' }).click();
  await expect(page.getByText('Added 2 items.')).toBeVisible();

  await page.goto('/inbox');
  await expect(page.getByText('fix hose')).toBeVisible();
  await expect(page.getByText('buy paint')).toBeVisible();
  await expect(page.getByText('call bank')).toHaveCount(0);
});

test('one item goes through every triage outcome', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/');
  await openCaptureSheet(page);
  await pasteLines(page, ['one: do now', 'two: next action', 'three: schedule', 'four: waiting', 'five: drop', 'six: project']);
  await expect(page.getByText('6 lines found.')).toBeVisible();
  await page.getByRole('button', { name: 'Add 6' }).click();
  await expect(page.getByText('Added 6 items.')).toBeVisible();

  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Process' }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await expect(dialog).toBeVisible();

  // 1: Do now
  await page.getByRole('button', { name: /1: Do now/i }).click();
  await expect(page.getByText('2 of 6')).toBeVisible();

  // 2: Next action (keyboard: 2 opens the step, Enter saves)
  await page.keyboard.press('2');
  await page.getByLabel('The next small step').fill('find the spanner');
  await page.getByRole('button', { name: 'Save next action' }).click();
  await expect(page.getByText('3 of 6')).toBeVisible();

  // 3: Schedule
  await page.getByRole('button', { name: /3: Schedule/i }).click();
  await page.getByLabel('Day to look at it again').fill('2026-11-03');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('4 of 6')).toBeVisible();

  // 4: Waiting, via the keyboard shortcut
  await page.keyboard.press('4');
  await expect(page.getByText('5 of 6')).toBeVisible();

  // 5: Drop (offers an undo)
  await page.getByRole('button', { name: /5: Drop/i }).click();
  await expect(page.getByRole('button', { name: /Undo dropped/i })).toBeVisible();
  await expect(page.getByText('6 of 6')).toBeVisible();

  // 6: Make project
  await page.getByRole('button', { name: /6: Make project/i }).click();
  await page.getByRole('button', { name: 'Make project' }).click();
  await expect(dialog.getByText('Inbox is clear.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Nothing to sort.')).toBeVisible();
});

test('the flag off hides capture and keeps the inbox route out of the way', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Inbox/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Capture a task' })).toHaveCount(0);

  await page.goto('/inbox');
  await page.waitForURL('**/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
