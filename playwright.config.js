// Browser end-to-end tests: real Chromium, real layout, real focus and scrolling.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/examples/tv-demo/`,
    reuseExistingServer: !process.env.CI,
  },
});
