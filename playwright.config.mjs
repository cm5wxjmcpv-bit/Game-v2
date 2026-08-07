import { defineConfig, devices } from '@playwright/test';

const hardeningMatch = '**/site-hardening.spec.mjs';
const localChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: localChromiumPath ? 'off' : 'retain-on-failure',
    launchOptions: localChromiumPath ? {
      executablePath: localChromiumPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    } : undefined,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      testMatch: hardeningMatch,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'firefox-desktop',
      testMatch: hardeningMatch,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-mobile',
      testMatch: hardeningMatch,
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
