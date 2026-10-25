// End-to-end tests: Chromium, WebKit and Firefox, each at a desktop and a phone size, against
// the built site served by `wrangler dev`, so the real asset routing, _headers (including the
// CSP) and the Worker's reserved paths are exercised. See docs/testing.md.
import { defineConfig, devices } from '@playwright/test';

const PORT = 8789;
const CI = !!process.env.CI;
const desktop = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: 'test/e2e',
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...desktop } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...desktop } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], ...desktop } },
    // Playwright can't emulate a mobile Firefox (no isMobile); a phone-sized touch screen covers the layout.
    { name: 'firefox-mobile', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true } },
  ],
  webServer: {
    command: `node scripts/build.mjs && npx wrangler dev --port ${PORT} --ip 127.0.0.1 --log-level warn`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
