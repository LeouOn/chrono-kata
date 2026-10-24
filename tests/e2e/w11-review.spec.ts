import { test, expect, type Page } from '@playwright/test';

/**
 * Roadmap Wave 11 — the weekly review wizard.
 *
 * Data is seeded straight into IndexedDB after the app has created the database,
 * because a task only becomes "waiting" after two weeks without a touch and the
 * UI has no way to backdate it. Every assertion about persistence reads the
 * store back, so "it looked right" is never the proof.
 */
test.use({ viewport: { width: 390, height: 844 } });

const WEEKING_TASK = '7c1d6a5e-1111-4111-8111-111111111111';
const INBOX_TASK = '7c1d6a5e-2222-4222-8222-222222222222';
const PROJECT = '7c1d6a5e-3333-4333-8333-333333333333';
const TRADING = '11111111-1111-4111-8111-111111111111';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
  await seedReviewData(page);
});

/**
 * Borrow a connection to the database the app created. Kept on `window` so the
 * next evaluate can use it; the caller closes it.
 */
async function openDb(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb = db;
  });
}

async function seedReviewData(page: Page) {
  await page.goto('/');
  await openDb(page);
  await page.evaluate(
    async ({ waitingTask, inboxTask, project }) => {
      const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
      const now = new Date();
      const old = new Date(now.getTime() - 20 * 86_400_000);
      const tx = db.transaction(['tasks', 'projects'], 'readwrite');
      tx.objectStore('projects').put({
        id: project,
        title: 'Rebuild the portfolio',
        domainId: null,
        status: 'active',
        cadencePerWeek: 2,
        breadcrumb: 'old breadcrumb',
        lastTouchedAt: old,
        createdAt: old,
        updatedAt: old,
      });
      tx.objectStore('tasks').put({
        id: waitingTask,
        title: 'Find the warranty email',
        status: 'next',
        source: 'manual',
        projectId: project,
        estimateMin: 20,
        createdAt: old,
        touchedAt: old,
      });
      tx.objectStore('tasks').put({
        id: inboxTask,
        title: 'sort the paper pile',
        status: 'inbox',
        source: 'manual',
        createdAt: now,
        touchedAt: now,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { waitingTask: WEEKING_TASK, inboxTask: INBOX_TASK, project: PROJECT },
  );
}

async function readRow(page: Page, store: string, key: string) {
  await openDb(page);
  return page.evaluate(
    async ({ store, key }) => {
      const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
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

async function readAll(page: Page, store: string) {
  await openDb(page);
  return page.evaluate(
    async ({ store }) => {
      const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return rows;
    },
    { store },
  );
}

/** Wait for the draft row to reach `step` (zero-based) before reloading. */
async function waitForDraftStep(page: Page, step: number) {
  await page.waitForFunction(
    async ({ step }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chrono-kata');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
        const request = db.transaction('reviewDrafts', 'readonly').objectStore('reviewDrafts').getAll();
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      });
      db.close();
      return rows.length > 0 && rows.every((row) => row.step === step);
    },
    { step },
  );
}

async function openReview(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: /weekly review/i }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole('heading', { name: 'Weekly review', level: 1 })).toBeVisible();
}

test('the home card opens the wizard at step 1 and names every step', async ({ page }) => {
  await openReview(page);

  await expect(page.getByText('Step 1 of 6: Clear the inbox')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Review progress' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await expect(page.getByRole('heading', { name: 'Clear the inbox' })).toBeVisible();
  await expect(page.getByText('One item is waiting to be sorted.')).toBeVisible();

  // The triage sheet is the inbox's own, reached from inside the step.
  await page.getByRole('button', { name: 'Open inbox triage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('sort the paper pile')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Clear the inbox' })).toBeVisible();
});

test('letting a waiting task go changes only its status, and the draft resumes after a reload', async ({
  page,
}) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 2 of 6: Sweep waiting tasks')).toBeVisible();
  await expect(page.getByText('Find the warranty email')).toBeVisible();
  await expect(page.getByText(/untouched \d+ days/)).toBeVisible();

  await page.getByRole('button', { name: /Let go of/ }).click();
  await expect(page.getByText('Let go. Nothing was deleted.')).toBeVisible();
  // The row stays on screen: a decision must never look like a deletion.
  await expect(page.getByText('Find the warranty email')).toBeVisible();
  await waitForDraftStep(page, 1);

  const task = await readRow(page, 'tasks', WEEKING_TASK);
  expect(task?.status).toBe('dropped');
  expect(task?.title).toBe('Find the warranty email');

  await page.reload();
  await expect(page.getByText('Step 2 of 6: Sweep waiting tasks')).toBeVisible();
  await expect(page.getByText('Let go. Nothing was deleted.')).toBeVisible();
  await expect(page.getByText('Find the warranty email')).toBeVisible();
});

test('back keeps state, and closing mid-flow resumes at the same step', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Keep “Find the warranty email”/ }).click();
  await expect(page.getByText('Kept as it is.')).toBeVisible();
  await waitForDraftStep(page, 1);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Step 1 of 6: Clear the inbox')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Kept as it is.')).toBeVisible();

  await page.getByRole('button', { name: 'Close for now' }).click();
  await expect(page).toHaveURL(/\/$/);
  const resume = page.getByRole('link', { name: /Resume your weekly review/ });
  await expect(resume).toBeVisible();
  await expect(resume).toContainText('step 2 of 6');
  await resume.click();
  await expect(page.getByText('Step 2 of 6: Sweep waiting tasks')).toBeVisible();
  await expect(page.getByText('Kept as it is.')).toBeVisible();
});

test('projects step saves a breadcrumb and pausing is a status change, not a delete', async ({ page }) => {
  await openReview(page);
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 3 of 6: Projects')).toBeVisible();

  const breadcrumb = page.getByLabel(/After this, the next step for “Rebuild the portfolio”/);
  await breadcrumb.fill('draft the case study outline');
  await page.getByRole('button', { name: /Save the next step for “Rebuild the portfolio”/ }).click();
  await expect
    .poll(async () => (await readRow(page, 'projects', PROJECT))?.breadcrumb)
    .toBe('draft the case study outline');

  await page.getByRole('button', { name: /Pause “Rebuild the portfolio”/ }).click();
  await expect.poll(async () => (await readRow(page, 'projects', PROJECT))?.status).toBe('paused');
  await expect(page.getByRole('button', { name: /Make “Rebuild the portfolio” active again/ })).toBeVisible();
});

test('finishing writes the review, its intentions and the snapshot, and clears the draft', async ({
  page,
}) => {
  await openReview(page);
  for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 6 of 6: Shape next week')).toBeVisible();

  const intention = page.getByLabel('Minutes for Trading next week');
  await expect(intention).toBeVisible();
  await intention.fill('120');
  await page.getByLabel('What stood out?').fill('A steady week; the trading journal helped.');
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByRole('heading', { name: 'Review saved' })).toBeVisible();

  const reviews = await readAll(page, 'reviews');
  expect(reviews).toHaveLength(1);
  const review = reviews[0]!;
  expect(String(review.notes)).toBe('A steady week; the trading journal helped.');
  expect(review.nextWeekIntentions).toEqual({ [TRADING]: 120 });
  const snapshot = review.statsSnapshot as { sessions: { total: number }; waitingTaskIds: string[] };
  expect(snapshot.sessions.total).toBe(0);
  expect(snapshot.waitingTaskIds).toEqual([WEEKING_TASK]);

  const drafts = await readAll(page, 'reviewDrafts');
  expect(drafts).toHaveLength(0);

  // A saved review does not leave a "resume" affordance behind.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start your weekly review' })).toBeVisible();
});

test('every wizard step fits the phone, names its controls and keeps a 44px target', async ({ page }) => {
  await openReview(page);
  for (let step = 0; step < 6; step += 1) {
    await expect(page.getByText(`Step ${step + 1} of 6:`)).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      `horizontal scroll on step ${step + 1}`,
    ).toBe(false);

    const unnamed = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'),
      );
      return controls
        .filter((control) => {
          const label = control.getAttribute('aria-label') ?? '';
          const labelled = control.id
            ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
            : null;
          const wrapping = control.closest('label');
          const name = [label, labelled?.textContent ?? '', wrapping?.textContent ?? '', control.textContent ?? '']
            .join(' ')
            .trim();
          return name === '';
        })
        .map((control) => control.outerHTML.slice(0, 120));
    });
    expect(unnamed, `unnamed controls on step ${step + 1}`).toEqual([]);

    if (step < 5) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  // The footer controls are reachable and large enough on the last step.
  for (const name of ['Back', 'Finish review', 'Close for now']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, `${name} has no box`).not.toBeNull();
    expect(box!.height, `${name} is shorter than 44px`).toBeGreaterThanOrEqual(44);
  }

  // The practice FAB must not sit on top of the footer controls.
  const covered = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('Close for now'),
    );
    if (!button) return 'missing';
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return atPoint && button.contains(atPoint) ? 'clear' : (atPoint?.outerHTML.slice(0, 80) ?? 'null');
  });
  expect(covered).toBe('clear');
});
