import { test, expect } from '@playwright/test';
import { checkAccessibility, expectNoAccessibilityViolations, runAccessibilityAudit } from '../utils/accessibility';

const ALL_PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'dashboard-main', path: '/dashboard' },
  { name: 'dashboard-time', path: '/dashboard/time' },
  { name: 'dashboard-leave', path: '/dashboard?panel=leave' },
  { name: 'dashboard-employees', path: '/dashboard/employees' },
  { name: 'dashboard-company', path: '/dashboard/company' },
  { name: 'dashboard-account', path: '/dashboard/account' },
  { name: 'dashboard-documents', path: '/dashboard/documents' },
];

test.describe('Full app accessibility audit', () => {
  for (const page of ALL_PAGES) {
    test(`${page.name}`, async ({ page: pwPage }) => {
      await pwPage.goto(page.path);
      await pwPage.waitForLoadState('networkidle');
      await expectNoAccessibilityViolations(pwPage, { threshold: 'serious' });
    });
  }
});

test('complete accessibility report', async ({ page }) => {
  const results = [];
  
  for (const p of ALL_PAGES) {
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    const result = await runAccessibilityAudit(page, `full-${p.name}`);
    results.push({ page: p.name, ...result });
  }
  
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    const summary = failed.map(f => `${f.page}: ${f.violations.length} violations`).join('\n');
    throw new Error(`Accessibility failures on ${failed.length} pages:\n${summary}`);
  }
});

test('color contrast audit', async ({ page }) => {
  for (const p of ALL_PAGES) {
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    
    await checkAccessibility(page, {
      includedTags: ['wcag2aa', 'cat.color'],
      threshold: 'moderate',
    });
  }
});

test('keyboard navigation audit', async ({ page }) => {
  for (const p of ALL_PAGES) {
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    
    await checkAccessibility(page, {
      includedTags: ['keyboard', 'focus'],
      threshold: 'moderate',
    });
  }
});