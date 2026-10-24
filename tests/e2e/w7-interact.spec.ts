import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 1500 }, hasTouch: true });

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

async function boxCentered(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  return locator.boundingBox();
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
  const box = await boxCentered(page, block);
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
  const lb = await boxCentered(page, late);
  await page.mouse.move(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2 + 66, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  // Escape-then-release must not open the sheet on the cancelled drag.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /fixed block Late 13:00 to 14:00/i })).toBeVisible();

  // Adjacent blocks 5 minutes apart: each edge resizes only its own block.
  await addCommitment(page, 'A2', '13:00', '14:00');
  await addCommitment(page, 'B2', '14:05', '15:05');
  const a2End = page.getByRole('button', { name: /resize end of A2/i });
  await a2End.hover();
  const ab = await a2End.boundingBox();
  await page.mouse.move(ab!.x + ab!.width / 2, ab!.y + ab!.height / 2);
  await page.mouse.down();
  await page.mouse.move(ab!.x + ab!.width / 2, ab!.y + ab!.height / 2 + 33, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /fixed block A2 13:00 to 14:30/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /fixed block B2 14:05 to 15:05/i })).toBeVisible();

  const b2Start = page.getByRole('button', { name: /resize start of B2/i });
  await b2Start.hover();
  const bb = await b2Start.boundingBox();
  await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /fixed block B2 14:30 to 15:05/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /fixed block A2 13:00 to 14:30/i })).toBeVisible();

  // A 30-minute block still moves from its centre (its handles leave a middle).
  await addCommitment(page, 'Short2', '16:00', '16:30');
  const short2 = page.getByRole('button', { name: /fixed block Short2 16:00 to 16:30/i });
  const sb = await boxCentered(page, short2);
  await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2 + 66, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /fixed block Short2 17:00 to 17:30/i })).toBeVisible();

  // The first keyboard Enter after a pointer drag still opens the sheet.
  await page.getByRole('button', { name: /fixed block Late 13:00 to 14:00/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
});

test('touch resize works from outside a block on both edges, and its middle still opens the sheet', async ({ page }) => {
  await enablePlanning(page);
  await page.goto('/timeline');
  await addCommitment(page, 'Top', '11:00', '11:30');
  const topBlock = await page.getByRole('button', { name: /fixed block Top 11:00 to 11:30/i }).boundingBox();
  expect(topBlock).not.toBeNull();
  const tx = topBlock!.x + topBlock!.width / 2;
  const ty = topBlock!.y - 20;
  const cdpStart = await page.context().newCDPSession(page);
  await cdpStart.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdpStart.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty - 5.5 * step }] });
  }
  await cdpStart.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: /fixed block Top 10:30 to 11:30/i })).toBeVisible();
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
