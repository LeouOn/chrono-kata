import { test, expect, type Page } from '@playwright/test';

/**
 * Wave 3 part 2: "Break it down" — privacy panel, wired call through a
 * routed provider, confirm-to-save, fallback path. Provider responses are
 * mocked at the HTTP boundary; the app itself is real.
 */
test.use({ viewport: { width: 390, height: 844 } });

const VALID_DECOMPOSITION = JSON.stringify({
  firstAction: 'Find the hose washer tin in the garage drawer',
  firstActionMinutes: 5,
  needs: ['a torch'],
  steps: [
    { title: 'Turn off the water at the valve', minutes: 2 },
    { title: 'Swap the washer', minutes: 10 },
  ],
  pitfalls: ['Starting with the water still on'],
  canSkipOrDoBadly: ['Polishing the tap while you are there'],
});

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** Configure deepseek with a pasted key, like a phone user (no desktop env). */
async function configureProvider(page: Page) {
  await page.route('**/api/local-ai', (route) => route.fulfill({ json: { providers: {} } }));
  await page.goto('/llm');
  const card = page.getByText('deepseek', { exact: true }).locator('..').locator('..').locator('..');
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('e2e-key');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
}

async function captureTask(page: Page, title: string) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill(title);
  await field.press('Enter');
}

test('break it down: shows what leaves the device, then saves only what is picked', async ({ page }) => {
  await page.route('https://api.deepseek.com/chat/completions', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: VALID_DECOMPOSITION } }] } })
  );
  await enableTaskInbox(page);
  await configureProvider(page);
  await captureTask(page, 'Fix the dripping hose');

  await page.getByRole('button', { name: /Break down Fix the dripping hose/i }).click();

  // Privacy panel: exact task text, provider named, remote labelled.
  const wire = page.getByTestId('wire-user');
  await expect(wire).toContainText('- title: Fix the dripping hose');
  await expect(page.getByTestId('wire-provider')).toContainText(/deepseek/);
  await expect(page.getByTestId('wire-provider')).toContainText(/remote provider/);
  await page.screenshot({ path: '/tmp/qa-w3-shots/privacy-panel.png' });

  await page.getByRole('button', { name: /Send to deepseek/i }).click();
  await expect(page.getByTestId('first-action')).toContainText('Find the hose washer tin');

  // Steps are collapsed by default.
  const steps = page.getByText(/Steps \(2\)/);
  await expect(steps).toBeVisible();
  await steps.click();
  await page.getByRole('checkbox', { name: /Turn off the water at the valve/i }).check();
  await page.screenshot({ path: '/tmp/qa-w3-shots/result-picks.png' });

  await page.getByRole('button', { name: /Confirm and save/i }).click();

  // The picked step is a subtask in the inbox; the first action is the next action.
  await expect(page.getByText('Turn off the water at the valve', { exact: true })).toBeVisible();
  await expect(page.getByText(/Pick up here:/)).toContainText('Find the hose washer tin');
  await page.screenshot({ path: '/tmp/qa-w3-shots/after-confirm.png' });

  // Survives a reload — saved through the repos, not component state.
  await page.reload();
  await expect(page.getByText('Turn off the water at the valve', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('two invalid replies become a plain-text fallback with nothing saved', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.deepseek.com/chat/completions', (route) => {
    calls += 1;
    return route.fulfill({ json: { choices: [{ message: { content: 'not json at all' } }] } });
  });
  await enableTaskInbox(page);
  await configureProvider(page);
  await captureTask(page, 'Sort the garage shelves');

  await page.getByRole('button', { name: /Break down Sort the garage shelves/i }).click();
  await page.getByRole('button', { name: /Send to deepseek/i }).click();

  await expect(page.getByTestId('fallback-text')).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm/i })).toHaveCount(0);
  expect(calls).toBe(2); // one repair round, then the fallback
});

test('triage hotkeys stay inert while the decompose sheet is open', async ({ page }) => {
  await page.route('https://api.deepseek.com/chat/completions', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: VALID_DECOMPOSITION } }] } })
  );
  await enableTaskInbox(page);
  await configureProvider(page);
  await captureTask(page, 'Hotkey guard task');

  await page.getByRole('button', { name: /^Process/ }).click();
  // Open the nested sheet from inside the process dialog (the inbox row
  // behind it has a button with the same name).
  await page.getByRole('dialog').getByRole('button', { name: /Break down Hotkey guard task/i }).click();
  await expect(page.getByTestId('wire-user')).toContainText('Hotkey guard task');
  await page.getByRole('button', { name: /Send to deepseek/i }).click();
  await expect(page.getByTestId('first-action')).toBeVisible();

  // Every triage hotkey: the task underneath must not move.
  for (const key of ['1', '2', '3', '4', '5', '6', 's']) {
    await page.keyboard.press(key);
  }
  await expect(page.getByTestId('first-action')).toBeVisible(); // sheet still open with its result
  await page.getByRole('button', { name: 'Save nothing' }).click();
  await page.keyboard.press('Escape'); // close the sheet
  await page.keyboard.press('Escape'); // close process mode
  // Wait for the dialogs to finish exiting before counting rows.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  // The task is still in the inbox, untouched by the hotkeys.
  await expect(page.getByText('Hotkey guard task', { exact: true })).toBeVisible();
});

test('step rows meet the 44px touch target', async ({ page }) => {
  await page.route('https://api.deepseek.com/chat/completions', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: VALID_DECOMPOSITION } }] } })
  );
  await enableTaskInbox(page);
  await configureProvider(page);
  await captureTask(page, 'Touch target task');
  await page.getByRole('button', { name: /Break down Touch target task/i }).click();
  await page.getByRole('button', { name: /Send to deepseek/i }).click();
  await expect(page.getByTestId('first-action')).toBeVisible();
  await page.getByText(/Steps \(2\)/).click();
  const height = await page
    .getByRole('checkbox', { name: /Turn off the water at the valve/i })
    .evaluate((el) => (el.closest('label') as HTMLElement).offsetHeight);
  expect(height).toBeGreaterThanOrEqual(44);
});
