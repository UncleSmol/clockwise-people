import { test, expect } from '@playwright/test';
import { checkAccessibility, expectNoAccessibilityViolations, runAccessibilityAudit } from '../utils/accessibility';

const DASHBOARD_PAGES = [
  { name: 'dashboard-main', path: '/dashboard' },
  { name: 'dashboard-time', path: '/dashboard/time' },
  { name: 'dashboard-leave', path: '/dashboard?panel=leave' },
  { name: 'dashboard-employees', path: '/dashboard/employees' },
  { name: 'dashboard-company', path: '/dashboard/company' },
  { name: 'dashboard-account', path: '/dashboard/account' },
  { name: 'dashboard-documents', path: '/dashboard/documents' },
];

for (const page of DASHBOARD_PAGES) {
  test(`${page.name} - accessibility audit`, async ({ page: pwPage }) => {
    await pwPage.goto(page.path);
    await pwPage.waitForLoadState('networkidle');
    await expectNoAccessibilityViolations(pwPage, { threshold: 'serious' });
  });

  test(`${page.name} - detailed accessibility report`, async ({ page: pwPage }) => {
    await pwPage.goto(page.path);
    await pwPage.waitForLoadState('networkidle');
    const result = await runAccessibilityAudit(pwPage, `dashboard-${page.name}`);
    expect(result.passed).toBe(true);
  });
}

test('dashboard-time - calendar accessibility', async ({ page }) => {
  await page.goto('/dashboard/time');
  await page.waitForLoadState('networkidle');
  
  await checkAccessibility(page, {
    includedTags: ['wcag2a', 'wcag2aa', 'keyboard'],
    threshold: 'moderate',
  });
});

test('dashboard-leave - form accessibility', async ({ page }) => {
  await page.goto('/dashboard?panel=leave');
  await page.waitForLoadState('networkidle');
  
  await checkAccessibility(page, {
    includedTags: ['wcag2a', 'wcag2aa', 'form'],
    threshold: 'moderate',
  });
});

test('dashboard-employees - table accessibility', async ({ page }) => {
  await page.goto('/dashboard/employees');
  await page.waitForLoadState('networkidle');
  
  await checkAccessibility(page, {
    includedTags: ['wcag2a', 'wcag2aa', 'table'],
    threshold: 'moderate',
  });
});