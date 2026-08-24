import { test, expect } from '@playwright/test';
import { expectVisualMatch, VIEWPORTS } from '../../utils/visual';

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006';

// Check if Storybook is available before running tests
const isStorybookAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(STORYBOOK_URL);
    return response.ok;
  } catch {
    return false;
  }
};

const STORIES = [
  { name: 'button-primary', path: '/iframe.html?id=components-button--primary&viewMode=story' },
  { name: 'button-secondary', path: '/iframe.html?id=components-button--secondary&viewMode=story' },
  { name: 'button-danger', path: '/iframe.html?id=components-button--danger&viewMode=story' },
  { name: 'input-default', path: '/iframe.html?id=components-input--default&viewMode=story' },
  { name: 'input-error', path: '/iframe.html?id=components-input--error&viewMode=story' },
  { name: 'card-default', path: '/iframe.html?id=components-card--default&viewMode=story' },
  { name: 'modal-default', path: '/iframe.html?id=components-modal--default&viewMode=story' },
  { name: 'avatar-default', path: '/iframe.html?id=components-avatar--default&viewMode=story' },
  { name: 'badge-default', path: '/iframe.html?id=components-badge--default&viewMode=story' },
  { name: 'table-default', path: '/iframe.html?id=components-table--default&viewMode=story' },
];

test.describe('Storybook visual tests (requires running Storybook)', () => {
  test.beforeAll(async () => {
    const available = await isStorybookAvailable();
    if (!available) {
      console.log(`Storybook not available at ${STORYBOOK_URL}, skipping tests`);
    }
  });

  for (const viewport of VIEWPORTS) {
    for (const story of STORIES) {
      test(`${story.name} - ${viewport.name}`, async ({ page }) => {
        const available = await isStorybookAvailable();
        if (!available) {
          test.skip(true, 'Storybook not running');
        }
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${STORYBOOK_URL}${story.path}`);
        await page.waitForLoadState('networkidle');
        await expectVisualMatch(page, `storybook-${story.name}-${viewport.name}`);
      });
    }
  }

  test('button-primary - desktop - hover state', async ({ page }) => {
    const available = await isStorybookAvailable();
    if (!available) test.skip(true, 'Storybook not running');
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${STORYBOOK_URL}/iframe.html?id=components-button--primary&viewMode=story`);
    await page.waitForLoadState('networkidle');
    const button = page.locator('button').first();
    await button.hover();
    await expectVisualMatch(page, 'storybook-button-primary-desktop-hover');
  });

  test('button-primary - desktop - focus state', async ({ page }) => {
    const available = await isStorybookAvailable();
    if (!available) test.skip(true, 'Storybook not running');
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${STORYBOOK_URL}/iframe.html?id=components-button--primary&viewMode=story`);
    await page.waitForLoadState('networkidle');
    const button = page.locator('button').first();
    await button.focus();
    await expectVisualMatch(page, 'storybook-button-primary-desktop-focus');
  });

  test('modal-default - desktop - open state', async ({ page }) => {
    const available = await isStorybookAvailable();
    if (!available) test.skip(true, 'Storybook not running');
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${STORYBOOK_URL}/iframe.html?id=components-modal--default&viewMode=story`);
    await page.waitForLoadState('networkidle');
    const trigger = page.locator('button:has-text("Open Modal")').first();
    await trigger.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await expectVisualMatch(page, 'storybook-modal-default-desktop-open');
  });
});