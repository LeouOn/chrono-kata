import { test, expect } from '@playwright/test';

test('desktop metadata selects DeepSeek without exposing a key', async ({ page }) => {
  await page.route('**/api/local-ai', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { defaultProvider: 'deepseek', providers: {
        deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: '', credentialSource: 'environment' },
      } } });
    } else {
      expect(route.request().headers().authorization).toBeUndefined();
      expect(route.request().postDataJSON()).toMatchObject({ providerName: 'deepseek', model: 'deepseek-flash' });
      await route.fulfill({ json: { choices: [{ message: { content: 'OK' } }] } });
    }
  });
  await page.goto('/llm');
  const card = page.getByText('deepseek', { exact: true }).locator('..').locator('..').locator('..');
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
  await expect(card.getByText('Desktop environment key')).toBeVisible();
  await card.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toHaveText('deepseek: connected using deepseek-flash.');
});

test('phone manual key setup works without desktop providers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/local-ai', (route) => route.fulfill({ json: { providers: {} } }));
  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-pasted-key');
    await route.fulfill({ json: { choices: [{ message: { content: 'OK' } }] } });
  });
  await page.goto('/llm');
  const card = page.getByText('deepseek', { exact: true }).locator('..').locator('..').locator('..');
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('API key', { exact: true }).fill('test-pasted-key');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('deepseek-flash');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toHaveText('deepseek: connected using deepseek-flash.');
  await page.reload();
  await expect(card.getByText('Active', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
