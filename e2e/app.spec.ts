import { test, expect } from '@playwright/test';

test('verify page title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/temp-app/);
});

test('smoke test @touch', async ({ page }) => {
  await page.goto('/');
  const counter = page.locator('button.counter');
  await expect(counter).toBeVisible();
  await expect(counter).toHaveText('Count is 0');
  await counter.tap();
  await expect(counter).toHaveText('Count is 1');
});
