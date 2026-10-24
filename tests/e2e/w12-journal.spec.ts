import { test, expect, type Page } from '@playwright/test';

/**
 * Roadmap Wave 12 — the journal and the evening shutdown.
 *
 * A day is seeded straight into IndexedDB (a plan with two picks and their
 * tasks) because the journal screen is about an existing day's picks. Every
 * assertion about persistence reads the store back.
 */
test.use({ viewport: { width: 390, height: 844 } });

const DONE_TASK = '9a1f6c2d-1111-4111-8111-111111111111';
const BACK_TASK = '9a1f6c2d-2222-4222-8222-222222222222';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function openDb(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    (window as unknown as { __journalDb: IDBDatabase }).__journalDb = db;
  });
}

async function readRow(page: Page, store: string, key: string) {
  await openDb(page);
  return page.evaluate(
    async ({ store, key }) => {
      const db = (window as unknown as { __journalDb: IDBDatabase }).__journalDb;
      const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).get(key as IDBValidKey);
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return row ?? null;
    },
    { store, key },
  );
}

function todayKey(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function seedDay(page: Page) {
  await page.goto('/');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some((entry) => entry.name === 'chrono-kata' && (entry.version ?? 0) >= 8);
  });
  const date = todayKey();
  await openDb(page);
  await page.evaluate(
    async ({ date, doneTask, backTask }) => {
      const db = (window as unknown as { __journalDb: IDBDatabase }).__journalDb;
      const now = new Date();
      const tx = db.transaction(['tasks', 'dayPlans'], 'readwrite');
      for (const [id, title] of [
        [doneTask, 'Fix the hose'],
        [backTask, 'Write the report'],
      ] as const) {
        tx.objectStore('tasks').put({
          id,
          title,
          status: 'next',
          source: 'manual',
          estimateMin: 30,
          createdAt: now,
          touchedAt: now,
        });
      }
      tx.objectStore('dayPlans').put({
        date,
        picks: [doneTask, backTask],
        capacityMin: 180,
        createdAt: now,
        updatedAt: now,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { date, doneTask: DONE_TASK, backTask: BACK_TASK },
  );
  return date;
}

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function openJournal(page: Page) {
  await page.goto('/journal');
  await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible();
}

test('the entry starts from the template, saves, and is still there after a reload', async ({ page }) => {
  await seedDay(page);
  await enableTaskInbox(page);
  await openJournal(page);

  const text = page.getByLabel('What happened today');
  await expect(text).toHaveValue(new RegExp(`## ${todayKey()}`));
  await text.fill('## Today\n\nTrading felt calm.\nPractice was short.');
  await page.getByLabel('Trading').check();
  await page.getByRole('button', { name: 'Save journal' }).click();
  await expect(page.getByRole('status')).toContainText('Saved on this device.');

  const date = todayKey();
  await expect
    .poll(async () => (await readRow(page, 'dayPlans', date))?.journal)
    .toBe('## Today\n\nTrading felt calm.\nPractice was short.');
  const stored = await readRow(page, 'dayPlans', date);
  expect(Object.keys((stored?.domainChecks ?? {}) as Record<string, boolean>)).toHaveLength(1);

  await page.reload();
  await expect(page.getByLabel('What happened today')).toHaveValue(/Trading felt calm/);
  await expect(page.getByLabel('Trading')).toBeChecked();
  await page.screenshot({ path: '/tmp/qa-w12-shots/journal-day.png', fullPage: true });
});

test('closing the day moves one pick and puts one back on the list', async ({ page }) => {
  const date = await seedDay(page);
  await enableTaskInbox(page);
  await openJournal(page);

  await page.getByRole('button', { name: /^Done: “Fix the hose”$/ }).click();
  await page.getByRole('button', { name: /^Back on the list: “Write the report”$/ }).click();
  await page.getByLabel('Shutdown note').fill('A calm evening.');
  await page.getByLabel(/Tomorrow's first move/).fill('Start with trading prep.');
  await page.getByRole('button', { name: 'Close the day' }).click();

  await expect(page.getByRole('status')).toContainText('The day is closed: 1 moved, 1 back on the list.');
  await expect(page.getByText(/^Closed at \d{2}:\d{2}$/)).toBeVisible();

  await expect.poll(async () => (await readRow(page, 'tasks', DONE_TASK))?.status).toBe('done');
  // Back on the list: the task is next again, and nothing was deleted.
  await expect.poll(async () => (await readRow(page, 'tasks', BACK_TASK))?.status).toBe('next');
  const plan = await readRow(page, 'dayPlans', date);
  expect(plan?.picksDone).toEqual([DONE_TASK]);
  expect(plan?.picksBack).toEqual([BACK_TASK]);
  expect(plan?.firstActionTomorrow).toBe('Start with trading prep.');

  await page.reload();
  // Reopening shows the stored decisions and offers to save changes.
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Done: “Fix the hose”$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: '/tmp/qa-w12-shots/journal-closed.png', fullPage: true });
});

test('yesterday keeps its own entry, reachable with a query parameter', async ({ page }) => {
  await seedDay(page);
  await enableTaskInbox(page);
  await openJournal(page);
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel('What happened today')).toHaveValue(/## \d{4}-\d{2}-\d{2}/);
  // Today's picks do not leak into yesterday.
  await expect(page.getByText('Fix the hose')).toHaveCount(0);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page).toHaveURL(/\/journal$/);
});

test('the journal is absent and inert with the flag off', async ({ page }) => {
  await page.goto('/journal');
  await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /journal/i })).toHaveCount(0);
});

test('every journal control fits the phone, has a name, and is not covered', async ({ page }) => {
  await seedDay(page);
  await enableTaskInbox(page);
  await openJournal(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  // Scope to this screen: the layout's floating capture control is owned and
  // tested by the inbox work, not by the journal.
  const screenScope = page.getByTestId('journal-screen');
  const unnamed = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="journal-screen"]');
    if (!root) return ['journal screen not found'];
    return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')).flatMap(
      (control) => {
        if (control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file') return [];
        const label = control.getAttribute('aria-label') ?? '';
        const labelled = control.id
          ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
          : null;
        const wrapping = control.closest('label');
        const name = [label, labelled?.textContent ?? '', wrapping?.textContent ?? '', control.textContent ?? '']
          .join(' ')
          .trim();
        return name === '' ? [control.outerHTML.slice(0, 120)] : [];
      },
    );
  });
  expect(unnamed).toEqual([]);

  const notInName = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="journal-screen"]');
    if (!root) return ['journal screen not found'];
    return Array.from(root.querySelectorAll<HTMLElement>('button, a[href]')).flatMap((control) => {
      const visible = (control.textContent ?? '').trim().toLowerCase();
      if (visible === '') return [];
      const accessible = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim().toLowerCase();
      return accessible.includes(visible) ? [] : [`${visible} => ${accessible}`];
    });
  });
  expect(notInName).toEqual([]);

  await expect(screenScope).toBeVisible();
  const pageText = ((await screenScope.textContent()) ?? '').toLowerCase();
  expect(pageText).not.toMatch(/\b(overdue|missed|failed|behind|late)\b/);

  // The floating practice button must not sit on top of the last control.
  const covered = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    if (!last) return 'missing';
    last.scrollIntoView({ block: 'center' });
    const rect = last.getBoundingClientRect();
    const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return atPoint && last.contains(atPoint) ? 'clear' : (atPoint?.outerHTML.slice(0, 80) ?? 'null');
  });
  expect(covered).toBe('clear');
});
