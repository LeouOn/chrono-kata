import { defineConfig } from '@playwright/test';

// Port for the e2e web server. Several agents share this host, so a fixed port
// collides when two suites run at once: export PLAYWRIGHT_PORT to pick another
// (3018, 3028, ...). Keep the default stable for single-run local use.
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3008;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
