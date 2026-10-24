import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Wave 10 part 2: the project list and the project page, on the production path.
 * The data is made the way a person makes it - capture a task, make it a
 * project, then do the work through the new-session button linked to the TASK
 * (which is how every Start button records work: no projectId on the session).
 * The page must still show that work as the project's.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = '/tmp/qa-w10-shots';
const GUILT = /\b(overdue|late|behind|missed|failed|dropped|abandoned|neglected)\b/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('onboarding-completed', 'true'));
});

async function enableTaskInbox(page: Page) {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Tasks and inbox (preview)' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** Capture "draft chapter two" and make it a project through process mode. */
async function makeProject(page: Page) {
  await page.goto('/inbox');
  const field = page.getByLabel('Add a task');
  await field.fill('draft chapter two ~25m');
  await field.press('Enter');
  await expect(page.getByText('draft chapter two')).toBeVisible();
  await page.getByRole('button', { name: 'Process' }).click();
  await page.getByRole('button', { name: /6: Make project/i }).click();
  await page.getByRole('button', { name: 'Make project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Process inbox' });
  await expect(dialog.getByText('Inbox is clear.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

/** One session on the project's TASK, ended with a pick-up note. */
async function workOnTheTask(page: Page, note: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New session' }).click();
  const picker = page.getByLabel('Working on (optional)');
  // Options: 0 = no link, 1 = the task, 2 = the project made from it.
  await picker.selectOption({ index: 1 });
  await expect(picker).toHaveValue(/task:/);
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByLabel(/Pick up here next time/).fill(note);
  await page.getByRole('button', { name: /Save session/i }).click();
  await expect(page.getByRole('dialog', { name: /New session/i })).toBeHidden();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal scroll at 390px').toBeLessThanOrEqual(0);
}

/**
 * At the end of the scroll, the last content sits above the two floating
 * buttons (practice and capture), so nothing - not even a long note - ends up
 * underneath them.
 */
async function endClearsTheFloatingButtons(page: Page, last: Locator) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastBox = await last.boundingBox();
  const practice = await page.getByRole('button', { name: 'New session' }).boundingBox();
  const capture = await page.getByRole('button', { name: 'Capture a task' }).boundingBox();
  expect(lastBox && practice && capture, 'all three are on the page').toBeTruthy();
  const floatingTop = Math.min(practice!.y, capture!.y);
  expect(lastBox!.y + lastBox!.height, 'last content ends above the floating buttons').toBeLessThanOrEqual(floatingTop);
}

/** A tap lands on the control itself, not on the practice button or the tab bar. */
async function reachable(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, 'control has a box').not.toBeNull();
  expect(box!.height, 'at least 44px tall').toBeGreaterThanOrEqual(44);
  const hit = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top !== null && (el === top || el.contains(top));
  });
  expect(hit, 'nothing is drawn over the control').toBe(true);
}

test('Home to the list to a project: the work done through its task shows up, calmly', async ({ page }) => {
  await enableTaskInbox(page);
  await makeProject(page);
  await workOnTheTask(page, 'pick up at the lighthouse');
  await workOnTheTask(page, 'start the storm scene');

  // Home: the Today card links to the list.
  await page.goto('/');
  const projectsLink = page.getByRole('link', { name: 'Projects', exact: true });
  await reachable(projectsLink);
  await projectsLink.click();
  await expect(page).toHaveURL(/\/projects$/);

  // The list: the project, worked on today (from task sessions, which carry no projectId).
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  const row = page.getByRole('link', { name: /draft chapter two/ });
  await expect(row).toContainText('Worked on today');
  await expect(row).toContainText('no rhythm set');
  await reachable(row);
  await noSidewaysScroll(page);
  await endClearsTheFloatingButtons(page, row);
  await page.screenshot({ path: `${SHOTS}/projects-list.png` });
  await row.click();

  // The page.
  await expect(page).toHaveURL(/\/projects\/detail\?id=/);
  await expect(page.getByRole('heading', { level: 1, name: 'draft chapter two' })).toBeVisible();
  await expect(page.getByText(/Active · .*Worked on today/)).toBeVisible();
  await expect(page.getByText('2 sessions').first()).toBeVisible();
  // "What is next" carries the note the TASK sessions left (the project has none of its own).
  const next = page.getByRole('heading', { name: 'What is next' }).locator('..');
  await expect(next.getByText('Pick up here', { exact: true })).toBeVisible();
  await expect(page.getByText('No note yet')).toHaveCount(0);
  await expect(page.getByText('Pick up here: start the storm scene')).toBeVisible();
  await expect(page.getByText('Pick up here: pick up at the lighthouse')).toBeVisible();
  // Newest first within the day.
  const notes = await page.getByText(/^Pick up here: /).allTextContents();
  expect(notes).toEqual(['Pick up here: start the storm scene', 'Pick up here: pick up at the lighthouse']);
  await expect(page.getByText('Progress').first()).toBeVisible();
  await noSidewaysScroll(page);

  // Calm: nothing on either page says anything is late or missed.
  expect(await page.locator('main, body').first().innerText()).not.toMatch(GUILT);

  // Every action is a 44px target nothing covers (the practice button sits bottom right).
  for (const link of await page.getByRole('link', { name: /^Open session from / }).all()) await reachable(link);
  await reachable(page.getByRole('link', { name: 'All projects' }));
  // The last history entry is the oldest session: its card must clear the floating buttons.
  await endClearsTheFloatingButtons(page, page.getByRole('listitem').last());
  await page.screenshot({ path: `${SHOTS}/project-detail.png`, fullPage: true });

  // A session on the timeline opens its own page.
  await page.getByRole('link', { name: /^Open session from / }).first().click();
  await expect(page).toHaveURL(/\/sessions\/detail\?id=/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'draft chapter two' })).toBeVisible();

  // A reload of the detail URL keeps working: the project is read from the query string.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'draft chapter two' })).toBeVisible();
  await expect(page.getByText('Pick up here: start the storm scene')).toBeVisible();
});

test('an unknown project says so calmly and offers the way back', async ({ page }) => {
  await enableTaskInbox(page);
  await page.goto('/projects/detail?id=00000000-0000-4000-8000-00000000dead');
  await expect(page.getByText("This project isn't here.")).toBeVisible();
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText('No projects yet.')).toBeVisible();
});

test('with the preview flag off, both routes send you home', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/projects/detail?id=anything');
  await expect(page).toHaveURL(/\/$/);
  // And the Today card, which would link there, is not shown at all.
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
});
