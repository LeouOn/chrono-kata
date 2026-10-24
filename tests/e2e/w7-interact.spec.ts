import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enablePlanning(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.getByLabel('Awake from').fill('08:00');
  await page.getByLabel('Awake until').fill('18:00');
  await page.waitForTimeout(200);
}

async function addCommitment(page: Page, title: string, from: string, until: string) {
  await page.getByRole('button', { name: /add a commitment/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('From').fill(from);
  await page.getByLabel('Until').fill(until);
  await page.getByRole('button', { name: /save block/i }).click();
}

test('mouse drag stores the moved times, and Escape cancels without writing', async ({ page }) => {
  await enablePlanning(page);
  await page.goto('/timeline');
  await addCommitment(page, 'Dentist', '09:00', '10:00');
  const block = page.getByRole('button', { name: /fixed block Dentist 09:00 to 10:00/i });
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 66, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /fixed block Dentist 10:00 to 11:00/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /fixed block Dentist 10:00 to 11:00/i })).toBeVisible();

  await addCommitment(page, 'Late', '13:00', '14:00');
  const late = page.getByRole('button', { name: /fixed block Late 13:00 to 14:00/i });
  const lb = await late.boundingBox();
  await page.mouse.move(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2 + 66, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.reload();
  await expect(page.getByRole('button', { name: /fixed block Late 13:00 to 14:00/i })).toBeVisible();

  // The first keyboard Enter after a pointer drag still opens the sheet.
  await page.getByRole('button', { name: /fixed block Late 13:00 to 14:00/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
});

test('touch resize works from a point outside a 30-minute block, and its middle still opens the sheet', async ({ page }) => {
  await enablePlanning(page);
  await page.goto('/timeline');
  await addCommitment(page, 'Short', '12:00', '12:30');
  const blockBox = await page.getByRole('button', { name: /fixed block Short 12:00 to 12:30/i }).boundingBox();
  expect(blockBox).not.toBeNull();
  // Start 20px below the block's bottom edge: inside the outward 44px hit area,
  // but outside the block body and outside a small visible bar.
  const x = blockBox!.x + blockBox!.width / 2;
  const y = blockBox!.y + blockBox!.height + 20;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 5.5 * step }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: /fixed block Short 12:00 to 13:00/i })).toBeVisible();

  const box = await page.getByRole('button', { name: /fixed block Short/i }).boundingBox();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Short');
});
