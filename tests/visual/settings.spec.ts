import { test, expect } from '@playwright/test';
import { expectVisualMatch, VIEWPORTS } from '../utils/visual';

// Settings pages require authentication
// Run with manual login or add auth setup

const SETTINGS_PAGES = [
  { name: 'account-profile', path: '/dashboard/account' },
  { name: 'company-settings', path: '/dashboard/company' },
];

test.describe('Settings visual tests (requires auth)', () => {
  for (const viewport of VIEWPORTS) {
    for (const page of SETTINGS_PAGES) {
      test.skip(`${page.name} - ${viewport.name}`, async ({ page: pwPage }) => {
        await pwPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await pwPage.goto(page.path);
        await pwPage.waitForLoadState('networkidle');
        await expectVisualMatch(pwPage, `${page.name}-${viewport.name}`);
      });
    }
  }

  test('account-profile - desktop - profile form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard/account');
    await page.waitForSelector('[data-testid="profile-form"]', { timeout: 10000 }).catch(() => {});
    await expectVisualMatch(page, 'account-profile-desktop-form');
  });

  test('account-profile - desktop - company settings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard/company');
    await page.waitForSelector('[data-testid="company-settings"]', { timeout: 10000 }).catch(() => {});
    await expectVisualMatch(page, 'account-company-desktop-settings');
  });
});