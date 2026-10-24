import { test, expect, type Page } from '@playwright/test';

/**
 * Roadmap Wave 19 — the command palette and the shortcut sheet.
 *
 * Ctrl/Cmd+K is the app's one global launcher; the palette is a shortcut layer
 * over screens and controls that all exist without it.
 */
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

async function openPalette(page: Page) {
  // Wait for the client tree to be live before sending a global shortcut: the
  // capture button only renders once the flag query has resolved, which is the
  // same moment the palette's key listener exists.
  await expect(page.getByRole('button', { name: 'Capture a task' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Commands' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the palette opens on Ctrl+K, filters, moves with the arrows and runs a command', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/');
  const dialog = await openPalette(page);

  const search = page.getByLabel('Type a command');
  await search.fill('journal');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible();

  // Arrow keys move the active option; Escape closes and returns focus.
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
  const searchAgain = page.getByLabel('Type a command');
  await searchAgain.fill('sessions');
  await searchAgain.press('ArrowDown');
  await expect(dialog.getByRole('option', { selected: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeHidden();
  await page.screenshot({ path: '/tmp/qa-w19-shots/palette.png' });
});

test('Ctrl+K 50 ms after Escape opens the palette again (its exit animation lingers)', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/');
  await openPalette(page);
  await page.keyboard.press('Escape');
  // The lead's finding: the dialog node stays ~0.5 s while it animates out, and
  // the old guard counted it as "another dialog is open".
  await page.waitForTimeout(50);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
  await expect(page.getByLabel('Type a command')).toBeFocused();
});

test('the palette is inert while another dialog is open', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Capture a task' }).click();
  const capture = page.getByRole('dialog', { name: 'Capture' });
  await expect(capture).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toHaveCount(0);
  await expect(capture).toBeVisible();
});

test('the shortcut sheet lives in Settings and matches the palette', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/settings#shortcuts');
  const sheet = page.getByText('Keyboard shortcuts');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#shortcuts')).toBeInViewport();
  await expect(page.getByText('Open the command palette')).toBeVisible();
  // The palette lists the same shortcut-bearing command.
  await openPalette(page);
  await page.getByLabel('Type a command').fill('capture a task');
  await expect(page.getByRole('dialog', { name: 'Commands' }).getByRole('option')).toHaveCount(1);
});
