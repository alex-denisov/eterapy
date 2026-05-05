import { expect, test } from "@playwright/test";

test.describe('ETerapy Homepage', () => {
  test('should load and show main heading', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Check for main heading - adjust selector based on actual page content
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/');

    // Check for essential navigation links
    await expect(page.locator('a[href="/products"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practitioners"]').first()).toBeVisible();
  });
});

test.describe('Authentication Flow', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');

    await page.waitForLoadState('networkidle');

    // Check for login form
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });
});
