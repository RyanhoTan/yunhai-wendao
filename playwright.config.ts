import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 80_000, expect: { timeout: 10_000 },
  use: { headless: !!process.env.CI, baseURL: 'http://127.0.0.1:4194', trace: {mode:'retain-on-failure',screenshots:false}, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 4194', url: 'http://127.0.0.1:4194', reuseExistingServer: !process.env.CI, timeout: 20_000 },
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1280, height: 720 } } }],
});
