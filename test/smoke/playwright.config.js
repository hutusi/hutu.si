// The daily production check (`npm run test:smoke`, .github/workflows/smoke.yml): the live site
// as a visitor gets it. SMOKE_URL points it elsewhere.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: process.env.SMOKE_URL ?? 'https://hutu.si', trace: 'retain-on-failure' },
  projects: [{ name: 'production', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
});
