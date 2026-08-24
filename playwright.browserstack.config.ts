import { defineConfig, devices } from '@playwright/test';

const BROWSERSTACK_USERNAME = process.env.BROWSERSTACK_USERNAME;
const BROWSERSTACK_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;
const BROWSERSTACK_HUB = `https://${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}@hub-cloud.browserstack.com/wd/hub`;

const capabilities = {
  'bstack:options': {
    projectName: 'Clockwise People UI QA',
    buildName: `build-${process.env.GITHUB_RUN_NUMBER || Date.now()}`,
    sessionName: 'UI QA Visual Tests',
    local: false,
    seleniumVersion: '4.0.0',
    debug: true,
    networkLogs: true,
    consoleLogs: 'info',
  },
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-browserstack', open: 'never' }],
    ['json', { outputFile: 'test-results/browserstack-results.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        connectOptions: {
          wsEndpoint: BROWSERSTACK_HUB,
        },
        launchOptions: {
          args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        connectOptions: {
          wsEndpoint: BROWSERSTACK_HUB,
        },
      },
    },
    {
      name: 'safari',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        connectOptions: {
          wsEndpoint: BROWSERSTACK_HUB,
        },
      },
    },
    {
      name: 'edge',
      use: {
        ...devices['Desktop Edge'],
        viewport: { width: 1280, height: 720 },
        connectOptions: {
          wsEndpoint: BROWSERSTACK_HUB,
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 200,
      threshold: 0.3,
    },
  },
});