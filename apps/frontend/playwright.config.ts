import { defineConfig, devices } from '@playwright/test';

// The e2e suite drives the real thing: the backend serves the "e2e" frontend build (which still
// contains the developer pages) with the SEO shell, exactly as in staging. Nothing is mocked.
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

// Playwright finds its own browsers. Set PW_CHROMIUM_EXECUTABLE only when they live elsewhere.
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...chromium } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...chromium } },
    // WebKit (Safari engine) runs where it is installed: CI sets E2E_WEBKIT=1.
    ...(process.env.E2E_WEBKIT === '1'
      ? [{ name: 'webkit-mobile', use: { ...devices['iPhone 14'] } }]
      : []),
  ],
  webServer: {
    command: 'node dist/server.js',
    cwd: '../backend',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      APP_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      FRONTEND_DIST_DIR: '../frontend/dist-e2e',
    },
  },
});
