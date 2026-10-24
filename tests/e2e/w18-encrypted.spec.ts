import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CANNOT_OPEN, decryptBackup, isEncryptedBackup } from '@/lib/data-transfer/encrypted';
import { buildDataset } from '../unit/data-transfer/oracle/dataset';
import { SECRET, backupTextOf, plantSecrets, primaryKeys } from '../unit/data-transfer/oracle/harness';

/**
 * Wave 18 part 3, in a real browser (real WebCrypto, real IndexedDB, real downloads): save an encrypted
 * backup with the secrets box ticked, open it on a brand-new device with the passphrase, and the two
 * devices hold the same data AND the same secrets. A wrong passphrase and a changed file are refused with
 * the same sentence and change nothing.
 */
const PHONE = { width: 390, height: 844 };
const PASS = 'a passphrase for the browser test';
test.use({ viewport: PHONE });

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: PHONE, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
  return context.newPage();
}

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/Importing shows you what will change first/)).toBeVisible();
}

async function chooseFile(page: Page, name: string, text: string) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
}

async function download(page: Page, click: () => Promise<void>): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent('download'), click()]);
  return readFileSync((await file.path())!, 'utf8');
}

/** The app's own IndexedDB, written directly: the one place a Google sign-in can come from in a test. */
async function putGoogleToken(page: Page) {
  await page.evaluate(
    (token) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chrono-kata');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('tokens', 'readwrite');
          tx.objectStore('tokens').put({ ...token, expiresAt: new Date(token.expiresAt) });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: 'google', accessToken: SECRET.accessToken, refreshToken: SECRET.refreshToken, expiresAt: '2030-01-01T00:00:00.000Z' },
  );
}

async function saveEncrypted(page: Page, tick: boolean): Promise<string> {
  await page.getByRole('button', { name: 'Export encrypted…' }).click();
  const form = page.getByTestId('encrypted-export');
  await form.getByLabel('Passphrase').fill(PASS);
  await form.getByLabel('Type it again').fill(PASS);
  const box = form.getByRole('checkbox');
  await expect(box).not.toBeChecked();
  if (tick) await box.check();
  return download(page, () => form.getByRole('button', { name: 'Save encrypted file' }).click());
}

async function savePlain(page: Page): Promise<Record<string, unknown>> {
  const file = JSON.parse(await download(page, () => page.getByRole('button', { name: 'Export JSON' }).click())) as Record<string, unknown>;
  delete file.exportedAt;
  return file;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

/** A "file from before Wave 18": it carries its own keys and calendar link, as old exports did. */
function backupWithSecrets(seed = 1810): string {
  const data = buildDataset(seed, 'full', primaryKeys());
  plantSecrets(data);
  data.settings![0]!.icsSubscriptionUrl = SECRET.icsUrl;
  data.settings![0]!.flags = { taskInbox: true };
  // The generated streak carries milestones the app has "just" earned; restoring a record with more of them
  // than the screen last saw makes the app throw a full-screen celebration over the page, which covers the
  // buttons this test clicks. A person's own exports list the milestones they already had.
  (data.streak![0] as Record<string, unknown>).milestonesAchieved = [];
  return backupTextOf(data);
}

test('save encrypted with the box ticked, open it on a new device: same data, same secrets', async ({ browser }) => {
  // Device A: a sign-in, then a pre-Wave-18 file that brings keys and the calendar link.
  const a = await newDevice(browser);
  await enableTaskInbox(a);
  await putGoogleToken(a);
  await chooseFile(a, 'old.json', backupWithSecrets());
  const previewA = a.getByTestId('import-preview');
  await previewA.getByRole('radio', { name: 'Replace everything on this device' }).check();
  await previewA.getByRole('button', { name: 'Replace everything…' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Replace everything' }).click();
  await expect(a.getByTestId('backup-outcome')).toContainText(/^Restored /);

  // The plain export leaves the secrets out; the encrypted one (ticked) holds them without showing them.
  const plainA = await savePlain(a);
  expect(JSON.stringify(plainA)).not.toContain('SECRET-');
  const encryptedA = await saveEncrypted(a, true);
  expect(isEncryptedBackup(encryptedA)).toBe(true);
  expect(encryptedA).not.toContain('SECRET-');
  await expect(a.getByTestId('backup-outcome')).toContainText(/Also inside it: \d+ API keys?, your Google Calendar sign-in and your private calendar link\.$/);

  // Device B: nothing on it. Wrong passphrase first, then the right one.
  const b = await newDevice(browser);
  await enableTaskInbox(b);
  await chooseFile(b, 'backup.encrypted.json', encryptedA);
  const prompt = b.getByTestId('passphrase-prompt');
  await expect(prompt.getByRole('heading', { name: 'This backup is encrypted' })).toBeVisible();
  await expect(prompt.getByLabel('Passphrase')).toHaveAttribute('type', 'password');
  await noHorizontalScroll(b);
  await prompt.getByLabel('Passphrase').fill('not the passphrase');
  await prompt.getByRole('button', { name: 'Open backup' }).click();
  await expect(prompt.getByRole('alert')).toHaveText(CANNOT_OPEN);
  await expect(b.getByTestId('import-preview')).toBeHidden();
  await prompt.getByLabel('Passphrase').fill(PASS);
  await prompt.getByRole('button', { name: 'Open backup' }).click();
  const previewB = b.getByTestId('import-preview');
  await expect(previewB.getByText(/This file also holds .*API keys?.*Google Calendar sign-in.*private calendar link: replacing restores them/)).toBeVisible();
  await previewB.getByRole('radio', { name: 'Replace everything on this device' }).check();
  await previewB.getByRole('button', { name: 'Replace everything…' }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Replace everything' }).click();
  await expect(b.getByTestId('backup-outcome')).toContainText(/^Restored /);

  // The wave's sentence, secrets included. One line of the files' own "what is left out" list differs by
  // design: device A was given AI providers marked as found from its environment, and those are never put in
  // a file (the new device finds its own), so only A reports leaving them out.
  const comparable = (file: Record<string, unknown>) => ({
    ...file,
    leftOut: (file.leftOut as { id: string }[]).filter((item) => item.id !== 'llmSettings.environmentProviders'),
  });
  expect(comparable(await savePlain(b))).toEqual(comparable(plainA));
  const encryptedB = await saveEncrypted(b, true);
  const openedA = await decryptBackup(encryptedA, PASS);
  const openedB = await decryptBackup(encryptedB, PASS);
  if (!openedA.ok || !openedB.ok) throw new Error('could not open the files');
  expect(openedA.secrets?.googleToken?.accessToken).toBe(SECRET.accessToken);
  expect(openedA.secrets?.icsSubscriptionUrl).toBe(SECRET.icsUrl);
  expect(Object.keys(openedA.secrets!.llmApiKeys).length).toBeGreaterThan(1);
  expect(openedB.secrets).toEqual(openedA.secrets);
  const strip = (backup: unknown) => comparable({ ...(backup as Record<string, unknown>), exportedAt: undefined });
  expect(strip(openedB.backup)).toEqual(strip(openedA.backup));
});

test('a changed file and a wrong passphrase are the same refusal, and nothing on the device changes', async ({ browser }) => {
  const a = await newDevice(browser);
  await enableTaskInbox(a);
  await chooseFile(a, 'old.json', backupWithSecrets(1811));
  await a.getByTestId('import-preview').getByRole('button', { name: 'Add what is missing' }).click();
  await expect(a.getByTestId('backup-outcome')).toContainText(/^Added /);
  const encrypted = await saveEncrypted(a, false);
  const before = await savePlain(a);

  const changed = JSON.parse(encrypted);
  changed.data = `${changed.data[0] === 'A' ? 'B' : 'A'}${changed.data.slice(1)}`;
  for (const [name, text, pass] of [['changed.json', JSON.stringify(changed), PASS], ['plain-wrong.json', encrypted, 'wrong wrong wrong']] as const) {
    await chooseFile(a, name, text);
    const prompt = a.getByTestId('passphrase-prompt');
    await prompt.getByLabel('Passphrase').fill(pass);
    await prompt.getByRole('button', { name: 'Open backup' }).click();
    await expect(prompt.getByRole('alert')).toHaveText(CANNOT_OPEN);
    await expect(a.getByTestId('import-preview')).toBeHidden();
  }
  expect(await savePlain(a)).toEqual(before);
});

test('the forms fit a phone: password fields, no sideways scroll, every target at least 44px', async ({ browser }) => {
  const page = await newDevice(browser);
  await enableTaskInbox(page);
  await page.getByRole('button', { name: 'Export encrypted…' }).click();
  const form = page.getByTestId('encrypted-export');
  await form.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(form.getByLabel('Passphrase')).toHaveAttribute('type', 'password');
  await expect(form.getByLabel('Type it again')).toHaveAttribute('type', 'password');
  await expect(form.getByRole('checkbox', { name: 'Also include my API keys, Google sign-in and private calendar link in this encrypted file' })).not.toBeChecked();
  await expect(form.getByRole('button', { name: 'Save encrypted file' })).toBeDisabled();
  await noHorizontalScroll(page);
  const targets = form.locator('input:not([type="checkbox"]), label:has(input[type="checkbox"]), button');
  for (let i = 0; i < (await targets.count()); i += 1) {
    const box = await targets.nth(i).boundingBox();
    expect(box!.height, `target ${i} is under 44px`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, `target ${i} runs off the screen`).toBeLessThanOrEqual(PHONE.width);
  }
});

test('with the preview flag off there is no encrypted export', async ({ browser }) => {
  const page = await newDevice(browser);
  await page.goto('/settings');
  await expect(page.getByText(/Importing replaces ALL local data/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export encrypted…' })).toBeHidden();
});
