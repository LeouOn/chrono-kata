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
const SESSION = '7c1d6a5e-4444-4444-8444-444444444444';
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
  // Wait for the app to finish creating and upgrading the database (Dexie v8),
  // using indexedDB.databases() so the wait itself cannot create a v1 database,
  // and for the default domains the balance step needs.
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some((entry) => entry.name === 'chrono-kata' && (entry.version ?? 0) >= 8);
  });
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('domains', 'readonly').objectStore('domains').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count > 0;
  });
  await openDb(page);
  // The settings row is created on the app's first read; give it a display name
  // so the "no name leaves the device" assertion can fail if one is sent.
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
      request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
    });
    db.close();
    return row !== undefined;
  });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chrono-kata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown>>((resolve) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ ...row, displayName: 'Ada Lovelace' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.evaluate(
    async ({ waitingTask, inboxTask, project, session }) => {
      const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
      const now = new Date();
      const old = new Date(now.getTime() - 20 * 86_400_000);
      const tx = db.transaction(['tasks', 'projects', 'sessions'], 'readwrite');
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
      // A timed session on the project's task, today at 09:00 so it is always
      // inside the reviewed week. It carries no project id of its own (the
      // picker is exclusive), which is the shape the stats attribute.
      const startedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
      tx.objectStore('sessions').put({
        id: session,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 30 * 60_000),
        durationMinutes: 30,
        rating: 4,
        activityLabel: 'Trading journal',
        note: 'PRIVATE-NOTE-MARKER-98765',
        taskId: waitingTask,
        outcome: 'done',
        createdAt: startedAt,
        updatedAt: startedAt,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { waitingTask: WEEKING_TASK, inboxTask: INBOX_TASK, project: PROJECT, session: SESSION },
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
  await page.screenshot({ path: '/tmp/qa-w11-shots/inbox-in-step.png' });
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

  await page.getByRole('button', { name: /^Let it go:/ }).click();
  await expect(page.getByText('Let go. Nothing was deleted.')).toBeVisible();
  await page.screenshot({ path: '/tmp/qa-w11-shots/waiting-let-go.png' });
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
  await page.getByRole('button', { name: /^Keep:/ }).click();
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

  // The row's "days since" is days since the project last had WORK, not since
  // its row was edited (the shared untouched rule).
  await expect(page.getByText(/last work|work today|work yesterday/)).toBeVisible();
  const breadcrumb = page.getByLabel(/After this, the next step for “Rebuild the portfolio”/);
  await breadcrumb.fill('draft the case study outline');
  await page.getByRole('button', { name: /^Save next step:/ }).click();
  await expect
    .poll(async () => (await readRow(page, 'projects', PROJECT))?.breadcrumb)
    .toBe('draft the case study outline');

  await page.getByRole('button', { name: /^Pause for now:/ }).click();
  await expect.poll(async () => (await readRow(page, 'projects', PROJECT))?.status).toBe('paused');
  await expect(page.getByRole('button', { name: /^Make active again:/ })).toBeVisible();
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
  await page.screenshot({ path: '/tmp/qa-w11-shots/shape-next-week.png', fullPage: true });
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByRole('heading', { name: 'Review saved' })).toBeVisible();
  await page.screenshot({ path: '/tmp/qa-w11-shots/review-saved.png' });

  const reviews = await readAll(page, 'reviews');
  expect(reviews).toHaveLength(1);
  const review = reviews[0]!;
  expect(String(review.notes)).toBe('A steady week; the trading journal helped.');
  expect(review.nextWeekIntentions).toEqual({ [TRADING]: 120 });
  const snapshot = review.statsSnapshot as { sessions: { total: number }; waitingTaskIds: string[] };
  expect(snapshot.sessions.total).toBe(1);
  expect(snapshot.waitingTaskIds).toEqual([WEEKING_TASK]);

  const drafts = await readAll(page, 'reviewDrafts');
  expect(drafts).toHaveLength(0);

  // A saved review does not leave a "resume" affordance behind.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Start your weekly review' })).toBeVisible();
});

test('the optional summary shows exactly what would leave the device and sends nothing by itself', async ({
  page,
}) => {
  await openReview(page);
  for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 6 of 6: Shape next week')).toBeVisible();

  await page.getByRole('button', { name: 'Get a summary' }).click();
  const wire = page.getByTestId('wire-user');
  await expect(wire).toContainText('Total sessions: 1');
  // A session note would be the one thing that must never travel; the seeded
  // session has none, so check the scrubbed fields are what is shown.
  await expect(wire).toContainText('Trading journal');
  // No provider is configured in this browser, so the panel names that state
  // instead of offering a send.
  await expect(page.getByText(/No provider|Checking the provider|Private mode/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Send to provider$/ })).toBeDisabled();
  await page.screenshot({ path: '/tmp/qa-w11-shots/summary-disclosure.png', fullPage: true });

  // Leaving it leaves the notes untouched, and the review still completes.
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByLabel('What stood out?').fill('No AI needed this week.');
  await page.getByRole('button', { name: 'Finish review' }).click();
  await expect(page.getByRole('heading', { name: 'Review saved' })).toBeVisible();
  const reviews = await readAll(page, 'reviews');
  expect(String(reviews[0]?.notes)).toBe('No AI needed this week.');
});

/** Configure a remote provider the way a phone user would (w3's pattern). */
async function configureProvider(page: Page) {
  await page.route('**/api/local-ai', (route) => route.fulfill({ json: { providers: {} } }));
  await page.goto('/llm');
  const card = page.getByText('deepseek', { exact: true }).locator('..').locator('..').locator('..');
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('e2e-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
}

test('sending the summary transmits exactly the two texts the panel shows', async ({ page }) => {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  await page.route('https://api.deepseek.com/chat/completions', (route) => {
    bodies.push(JSON.parse(String(route.request().postData() ?? '{}')));
    return route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                observations: ['Trading got the week.', 'Practice stalled once.'],
                question: 'What would make practice easy to start?',
              }),
            },
          },
        ],
      },
    });
  });
  await configureProvider(page);
  await openReview(page);
  for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 6 of 6: Shape next week')).toBeVisible();

  await page.getByRole('button', { name: 'Get a summary' }).click();
  const wireUser = page.getByTestId('wire-user');
  const wireSystem = page.getByTestId('wire-system');
  await expect(wireUser).toContainText('Total sessions: 1');
  // Nothing is sent just by opening the panel, and the note never appears.
  expect(bodies).toHaveLength(0);
  await expect(wireUser).not.toContainText('PRIVATE-NOTE-MARKER-98765');
  await page.getByText('Also sent: the coach instruction').click();
  const shownSystem = await wireSystem.textContent();
  const shownUser = await wireUser.textContent();
  expect(shownSystem).toBeTruthy();
  expect(shownUser).toBeTruthy();

  await page.getByRole('button', { name: /^Send to deepseek$/ }).click();
  // Assert after the reply has arrived, not on the click's next frame.
  await expect(page.getByText('Trading got the week.')).toBeVisible();

  expect(bodies).toHaveLength(1);
  // Byte for byte: the system and user messages are the two texts on screen.
  expect(bodies[0]!.messages).toEqual([
    { role: 'system', content: shownSystem },
    { role: 'user', content: shownUser },
  ]);
  const wire = JSON.stringify(bodies[0]);
  expect(wire).not.toContain('PRIVATE-NOTE-MARKER-98765');
  expect(wire).not.toContain('Ada Lovelace');
  expect(wire).not.toContain("The user's name is");
  await page.screenshot({ path: '/tmp/qa-w11-shots/summary-sent.png', fullPage: true });
});

test('private mode disables the summary send and sends nothing', async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route('https://api.deepseek.com/chat/completions', (route) => {
    bodies.push(JSON.parse(String(route.request().postData() ?? '{}')));
    return route.fulfill({ json: { choices: [{ message: { content: '{}' } }] } });
  });
  await configureProvider(page);
  // Turn private mode on through the settings row, as the switch does.
  await openDb(page);
  await page.evaluate(async () => {
    const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
    const row = await new Promise<Record<string, unknown>>((resolve) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('singleton');
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const flags = (row.flags ?? {}) as Record<string, boolean>;
      tx.objectStore('settings').put({ ...row, flags: { ...flags, privateMode: true } });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await openReview(page);
  for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Get a summary' }).click();
  await expect(page.getByText(/only a provider on this device/)).toBeVisible();
  const send = page.getByRole('button', { name: /^Send to provider$/ });
  await expect(send).toBeDisabled();
  expect(bodies).toHaveLength(0);
});

test('an unfinished review from an earlier week asks before it takes over', async ({ page }) => {
  const lastMonday = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7 - ((date.getDay() + 6) % 7));
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  await openDb(page);
  await page.evaluate(
    async ({ weekOf }) => {
      const db = (window as unknown as { __reviewDb: IDBDatabase }).__reviewDb;
      const tx = db.transaction('reviewDrafts', 'readwrite');
      tx.objectStore('reviewDrafts').put({
        weekOf,
        step: 2,
        decisions: { notes: 'left over from last week' },
        updatedAt: new Date(),
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { weekOf: lastMonday },
  );

  await openReview(page);
  await expect(page.getByText(/You have an unfinished review for the week of/)).toBeVisible();
  await expect(page.getByText(/^Step 1 of 6:/)).toHaveCount(0);

  await page.getByRole('button', { name: /Start this week/ }).click();
  await expect(page.getByText('Step 1 of 6: Clear the inbox')).toBeVisible();
  // Starting this week does not destroy the older draft.
  const kept = await readRow(page, 'reviewDrafts', lastMonday);
  expect(kept?.step).toBe(2);
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

    const pageText = (await page.evaluate(() => document.body.textContent ?? '')).toLowerCase();
    expect(pageText, `failure vocabulary on step ${step + 1}`).not.toMatch(
      /\b(dropped|abandoned|failed|behind|overdue|late)\b/,
    );

    const notInName = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('button, a[href]')).flatMap((control) => {
        const visible = (control.textContent ?? '').trim().toLowerCase();
        if (visible === '') return [];
        const accessible = (control.getAttribute('aria-label') ?? control.textContent ?? '')
          .trim()
          .toLowerCase();
        return accessible.includes(visible) ? [] : [`${visible} => ${accessible}`];
      }),
    );
    expect(notInName, `label-in-name on step ${step + 1}`).toEqual([]);

    await page.screenshot({ path: `/tmp/qa-w11-shots/step-${step + 1}.png`, fullPage: true });
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
