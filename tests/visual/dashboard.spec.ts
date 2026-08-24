import { test, expect } from '@playwright/test';
import { expectVisualMatch, VIEWPORTS } from '../utils/visual';

// Dashboard pages require authentication - these tests need a logged-in session
// Run with: npm run ui-qa:visual -- --grep="dashboard" after manual login
// Or use a test setup that authenticates

const DASHBOARD_PAGES = [
  { name: 'dashboard-main', path: '/dashboard' },
  { name: 'dashboard-time', path: '/dashboard/time' },
  { name: 'dashboard-leave', path: '/dashboard?panel=leave' },
  { name: 'dashboard-employees', path: '/dashboard/employees' },
  { name: 'dashboard-company', path: '/dashboard/company' },
  { name: 'dashboard-account', path: '/dashboard/account' },
  { name: 'dashboard-documents', path: '/dashboard/documents' },
];

test.describe('Dashboard visual tests (requires auth)', () => {
  test.beforeEach(async ({ page }) => {
    // Add authentication logic here if needed
    // For now, these tests are skipped unless manually authenticated
  });

  for (const viewport of VIEWPORTS) {
    for (const page of DASHBOARD_PAGES) {
      test.skip(`${page.name} - ${viewport.name}`, async ({ page: pwPage }) => {
        await pwPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await pwPage.goto(page.path);
        await pwPage.waitForLoadState('networkidle');
        await expectVisualMatch(pwPage, `${page.name}-${viewport.name}`);
      });
    }
  }

  test('dashboard-main - desktop - sidebar navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard');
    await expectVisualMatch(page, 'dashboard-main-desktop-sidebar');
  });

  test('dashboard-time - desktop - calendar view', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/dashboard/time');
    await page.waitForSelector('[data-testid="timesheet-calendar"]', { timeout: 10000 }).catch(() => {});
    await expectVisualMatch(page, 'dashboard-time-desktop-calendar');
  });

  test('dashboard-leave - desktop - leave balances', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard?panel=leave');
    await page.waitForSelector('[data-testid="leave-balances"]', { timeout: 10000 }).catch(() => {});
    await expectVisualMatch(page, 'dashboard-leave-desktop-balances');
  });

  test('dashboard-employees - desktop - employee table', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/dashboard/employees');
    await page.waitForSelector('[data-testid="employee-table"]', { timeout: 10000 }).catch(() => {});
    await expectVisualMatch(page, 'dashboard-employees-desktop-table');
  });
});