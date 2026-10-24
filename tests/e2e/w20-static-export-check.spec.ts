import { test, expect, type Page } from '@playwright/test';

// Served against the static export (python http.server on out/), NOT next start:
// proves the error boundary ships in the Android build. It needs that export
// served on :3049, so it is skipped unless W20_STATIC_EXPORT=1 (the normal
// suite has no such server). The three-line procedure is in docs/waves/wave-20.md.
test.skip(process.env.W20_STATIC_EXPORT !== '1', 'needs the static export served on :3049, see docs/waves/wave-20.md');

test.use({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:3049' });

async function enableTaskInbox(page: Page) {
  await page.goto('/settings.html');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

test('error boundary works in the static export', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
  await enableTaskInbox(page);
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('chrono-kata');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('tasks', 'readwrite');
        tx.objectStore('tasks').put({
          id: '00000000-0000-4000-8000-000000000bad',
          title: 'corrupt row',
          status: 'inbox',
          source: 'manual',
          createdAt: 'not-a-date',
          touchedAt: 'not-a-date',
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  await page.goto('/inbox.html');
  await expect(page.getByText('Something went wrong on this screen.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to the Home screen' }).click();
  await expect(page.getByText(/Chrono Kata|Today|streak|Practice/i).first()).toBeVisible();
});
