import { test, expect } from '@playwright/test';

test('verify page title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/temp-app/);
});
