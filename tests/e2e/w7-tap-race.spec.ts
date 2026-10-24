import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
test.setTimeout(90_000);

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
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  // The switch is optimistic; wait for the settings row to be written before
  // navigating, so the timeline cannot mount with the old flag under load.
  await waitForTaskInbox(page);
  await page.waitForTimeout(200);
}

async function add(page: Page, title: string, from: string, until: string) {
  await page.getByRole('button', { name: /add a commitment/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('From').fill(from);
  await page.getByLabel('Until').fill(until);
  await page.getByRole('button', { name: /save block/i }).click();
}

// Make zero-delay timers run as microtasks, so any timer racing the browser's
// follow-up click loses deterministically (lead-probe45b).
async function raceTimers(page: Page) {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (ms === 0) {
        queueMicrotask(() => Reflect.apply(fn as (...a: unknown[]) => void, window, args));
        return 0;
      }
      return original(fn, ms, ...args);
    }) as typeof window.setTimeout;
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

test('with timers losing the race, a touch tap opens and keeps the sheet', async ({ page }) => {
  await raceTimers(page);
  await enablePlanning(page);
  await gotoTimeline(page);
  await add(page, 'Tap me', '09:00', '10:00');

  await page.getByRole('button', { name: /fixed block Tap me 09:00 to 10:00/i }).tap();
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /resize end of Tap me/i }).tap();
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole('dialog', { name: 'Edit block' })).toBeVisible();
});

test('with timers losing the race, commits and cancels never open the sheet', async ({ page }) => {
  await raceTimers(page);
  await enablePlanning(page);
  await gotoTimeline(page);
  await add(page, 'Drag me', '09:00', '10:00');

  const block = page.getByRole('button', { name: /fixed block Drag me 09:00 to 10:00/i });
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await block.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 66, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /fixed block Drag me 10:00 to 11:00/i })).toBeVisible();

  const moved = page.getByRole('button', { name: /fixed block Drag me 10:00 to 11:00/i });
  const mb = await moved.boundingBox();
  await page.mouse.move(mb!.x + mb!.width / 2, mb!.y + mb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(mb!.x + mb!.width / 2, mb!.y + mb!.height / 2 + 66, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /fixed block Drag me 10:00 to 11:00/i })).toBeVisible();
});
