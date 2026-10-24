import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function waitForTaskInbox(page: Page) {
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ flags?: { taskInbox?: boolean } } | undefined>((resolve) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return row?.flags?.taskInbox === true;
  });
}

async function forceFlagOn(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
      request.onsuccess = () => resolve(request.result);
    });
    if (row) {
      const flags = (row.flags ?? {}) as Record<string, boolean>;
      if (flags.taskInbox !== true) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ ...row, flags: { ...flags, taskInbox: true } });
          tx.oncomplete = () => resolve();
        });
      }
    }
    db.close();
  });
}

async function gotoTimeline(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/timeline');
    if ((await page.getByRole('button', { name: /add a commitment/i }).count()) > 0) return;
    await forceFlagOn(page);
    await page.waitForTimeout(200);
  }
}

async function enablePlanning(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // The switch is optimistic; wait for the settings row to be written before
  // navigating, so the timeline cannot mount with the old flag under load.
  await waitForTaskInbox(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // The switch is optimistic; wait for the settings row to be written before
  // navigating, so the timeline cannot mount with the old flag under load.
  await waitForTaskInbox(page);
  await page.waitForTimeout(200);
}

async function addCommitment(page: Page, title: string, from: string, until: string) {
  await page.getByRole('button', { name: /add a commitment/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('From').fill(from);
  await page.getByLabel('Until').fill(until);
  await page.getByRole('button', { name: /save block/i }).click();
}

async function tapBlock(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(`fixed block ${title}`, 'i') }).tap();
}

test('overlapping commitments sit in lanes and both are tappable by touch', async ({ page }) => {
  await enablePlanning(page);
  await gotoTimeline(page);
  await addCommitment(page, 'Dentist', '09:00', '11:00');
  await addCommitment(page, 'School run', '10:00', '12:00');

  const a = page.getByRole('button', { name: /fixed block Dentist/i });
  const b = page.getByRole('button', { name: /fixed block School run/i });
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  const boxA = await a.boundingBox();
  const boxB = await b.boundingBox();
  expect(boxA).not.toBeNull();
  expect(boxB).not.toBeNull();
  // Side by side, not stacked: B starts at or after A's right edge.
  expect(boxA!.x + boxA!.width).toBeLessThanOrEqual(boxB!.x + 2);

  await page.screenshot({ path: '/tmp/qa-w7-shots/w7-lanes-touch.png', fullPage: true });

  // The lower block used to be covered by the upper one; a touch tap must open its sheet.
  await tapBlock(page, 'School run');
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('School run');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toHaveCount(0);

  await tapBlock(page, 'Dentist');
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Dentist');

  // The resize handle is a real touch target that opens the same sheet on tap.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toHaveCount(0);
  const handle = page.getByRole('button', { name: /resize end of Dentist/i });
  const hb = await handle.boundingBox();
  expect(hb).not.toBeNull();
  await page.touchscreen.tap(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
});
