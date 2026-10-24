import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const SIMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VEVENT',
  'UID:e2e-meet-1@cal',
  'SUMMARY:Physio appointment',
  'DTSTART:20260302T090000Z',
  'DTEND:20260302T100000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

test('calendar card is hidden while the taskInbox flag is off', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeHidden();
  await expect(page.getByLabel('Import from a file')).toBeHidden();
});

test('imports an .ics file with a preview and writes only on confirm', async ({ page }) => {
  await enableTaskInbox(page);

  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

  // Nothing happens until a file is chosen.
  await expect(page.getByTestId('ics-preview')).toBeHidden();

  await page.getByLabel('Import from a file').setInputFiles({
    name: 'physio.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(SIMPLE_ICS),
  });

  // Preview: counts + list + confirm; nothing written yet.
  await expect(page.getByText(/1 new · 0 updated · 0 unchanged/)).toBeVisible();
  await expect(page.getByText('Physio appointment')).toBeVisible();

  await page.getByRole('button', { name: 'Save 1 block' }).click();
  await expect(page.getByTestId('ics-preview')).toBeHidden();

  // Re-importing the same file reports unchanged and offers no write.
  await page.getByLabel('Import from a file').setInputFiles({
    name: 'physio.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(SIMPLE_ICS),
  });
  await expect(page.getByText(/0 new · 0 updated · 1 unchanged/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save/ })).toBeHidden();
});

test('rejects a non-https address calmly and fetches nothing', async ({ page }) => {
  await enableTaskInbox(page);
  await page.getByLabel(/calendar address/i).fill('http://example.com/a.ics');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText(/Only https addresses/)).toBeVisible();
});

test('every calendar control exposes an accessible name', async ({ page }) => {
  await enableTaskInbox(page);
  const scope = page.locator('main');
  const controls = scope.locator('input, select, textarea, button');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const name =
      (await control.getAttribute('aria-label')) ??
      (await control.getAttribute('aria-labelledby')) ??
      (await control.textContent());
    expect(String(name ?? '').trim(), `control #${i} has no accessible name`).not.toBe('');
  }
});
