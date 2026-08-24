import { test, expect } from '@playwright/test';
import { checkAccessibility, expectNoAccessibilityViolations, runAccessibilityAudit } from '../utils/accessibility';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'auth-callback', path: '/auth/callback' },
];

for (const page of PAGES) {
  test(`${page.name} - accessibility audit`, async ({ page: pwPage }) => {
    await pwPage.goto(page.path);
    await pwPage.waitForLoadState('networkidle');
    await expectNoAccessibilityViolations(pwPage, { 
      threshold: 'serious',
      excludedRules: ['page-has-heading-one', 'color-contrast'],
    });
  });

  test(`${page.name} - detailed accessibility report`, async ({ page: pwPage }) => {
    await pwPage.goto(page.path);
    await pwPage.waitForLoadState('networkidle');
    const result = await runAccessibilityAudit(pwPage, `auth-${page.name}`, { 
      threshold: 'serious',
      excludedRules: ['page-has-heading-one', 'color-contrast'],
    });
    expect(result.passed).toBe(true);
  });
}

test('login - form accessibility', async ({ page }) => {
  await page.goto('/login');
  await page.waitForSelector('form', { timeout: 10000 }).catch(() => {});
  
  await checkAccessibility(page, {
    includedTags: ['wcag2a', 'wcag2aa', 'form'],
    threshold: 'moderate',
  });
});

test('login - keyboard navigation', async ({ page }) => {
  await page.goto('/login');
  
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  
  await checkAccessibility(page, {
    threshold: 'serious',
  });
});