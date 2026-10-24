import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enablePlanning(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Awake from').fill('00:00');
  await page.getByLabel('Awake until').fill('23:59');
  await page.waitForTimeout(200);
}

async function captureAndPromote(page: Page, title: string) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill(`${title} ~15m`);
  await field.press('Enter');
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole('button', { name: 'Process' }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await dialog.getByRole('button', { name: /2: Next action/i }).click();
  await page.getByLabel('The next small step').fill(`start on ${title}`);
  await page.getByRole('button', { name: 'Save next action' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

test('add, edit and remove a commitment on the timeline', async ({ page }) => {
  await enablePlanning(page);
  await page.goto('/timeline');
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();

  await page.getByRole('button', { name: /add a commitment/i }).click();
  await page.getByLabel('Title').fill('Dentist');
  await page.getByLabel('From').fill('07:07');
  await page.getByLabel('Until').fill('08:00');
  await page.getByRole('button', { name: /save block/i }).click();
  const block = page.getByRole('button', { name: /fixed block Dentist 07:07 to 08:00/i });
  await expect(block).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /fixed block Dentist/i })).toBeVisible();

  await page.getByRole('button', { name: /fixed block Dentist/i }).click();
  await page.getByLabel('Until').fill('08:30');
  await page.getByRole('button', { name: /save block/i }).click();
  await expect(page.getByRole('button', { name: /fixed block Dentist 07:07 to 08:30/i })).toBeVisible();

  await page.getByRole('button', { name: /fixed block Dentist/i }).click();
  await page.getByRole('button', { name: /remove this block/i }).click();
  await page.getByRole('button', { name: /^remove$/i }).click();
  await expect(page.getByRole('button', { name: /fixed block Dentist/i })).toHaveCount(0);
});

test('propose writes focus blocks only on Apply, and Today shows Now or Next', async ({ page }) => {
  await enablePlanning(page);
  await captureAndPromote(page, 'write the report');
  await page.goto('/timeline');
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();

  // Cancel leaves the day untouched.
  await page.getByRole('button', { name: /propose a layout/i }).click();
  await expect(page.getByText(/focus block.*proposed|Nothing fits/i)).toBeVisible();
  await page.getByRole('button', { name: /^cancel$/i }).click();
  await expect(page.getByRole('button', { name: /focus block/i })).toHaveCount(0);

  // Apply writes the proposal.
  await page.getByRole('button', { name: /propose a layout/i }).click();
  await page.getByRole('button', { name: /apply this layout/i }).click();
  await expect(page.getByRole('button', { name: /focus block/i }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /focus block/i }).first()).toBeVisible();

  // Home's Today card shows the block as Now or Next with Start.
  await page.goto('/');
  await expect(page.getByText("Today's plan")).toBeVisible();
  await expect(page.getByText(/^(Now|Next) · /)).toBeVisible();
  await expect(page.getByRole('button', { name: /start a session for/i }).first()).toBeVisible();
});
