import { test, expect } from '@playwright/test';
import { expectVisualMatch, VIEWPORTS } from '../utils/visual';

const PUBLIC_PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
];

for (const viewport of VIEWPORTS) {
  for (const page of PUBLIC_PAGES) {
    test(`${page.name} - ${viewport.name}`, async ({ page: pwPage }) => {
      await pwPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await pwPage.goto(page.path);
      await expectVisualMatch(pwPage, `${page.name}-${viewport.name}`);
    });
  }
}

test('home - mobile - interactive elements', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expectVisualMatch(page, 'home-mobile-interactive');
});

test('login - mobile - form validation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/login');
  await page.fill('input[name="email"]', 'invalid-email');
  await page.click('button.btn-accent');
  await expectVisualMatch(page, 'login-mobile-validation-error');
});