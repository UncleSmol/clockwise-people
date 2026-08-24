import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isCI = !!process.env.CI;
const isVisual = process.env.PLAYWRIGHT_VISUAL === 'true';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'desktop-xl', width: 1920, height: 1080 },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2, // Reduce workers for authenticated tests
  timeout: 60000, // Increase default timeout
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: isCI ? 'on-first-retry' : 'on',
    screenshot: isVisual ? 'only-on-failure' : 'off',
    video: isCI ? 'retain-on-failure' : 'off',
    // Increase navigation timeout
    navigationTimeout: 60000,
    actionTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    ...(isVisual
      ? viewports.flatMap((vp) =>
          ['chromium', 'firefox', 'webkit'].map((browser) => ({
            name: `${browser}-${vp.name}`,
            use: {
              ...devices[`Desktop ${browser.charAt(0).toUpperCase() + browser.slice(1)}`],
              viewport: { width: vp.width, height: vp.height },
            },
          }))
        )
      : []),
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120000,
  },
  snapshotDir: path.join(__dirname, 'tests', 'visual', '__snapshots__'),
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 200,
      threshold: 0.2,
    },
  },
  outputDir: 'test-results',
});