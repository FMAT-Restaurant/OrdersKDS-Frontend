import { test, expect } from '@playwright/test';

test('verify page title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/temp-app/);
});

test('KDS touch shell @touch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KDS App' })).toBeVisible();
  await expect(page.getByTestId('kds-board-container')).toBeVisible();
});

test('KDS actions use one touch and 64px targets @touch', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/kds/queue*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'order-touch-1',
          status: 'RESERVED',
          version: 1,
          items: [
            {
              id: 'item-touch-1',
              name: 'Hamburguesa',
              quantity: 1,
              unitPrice: 10,
              status: 'PENDING',
              station: 'frio',
            },
          ],
        },
      ]),
    }),
  );
  await page.route('**/orders/**', async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 204 });
  });

  await page.goto('/');
  const start = page.getByTestId('order-action-start-order-touch-1');
  const item = page.getByTestId('order-item-item-touch-1');
  await expect(start).toBeVisible();
  await expect(item).toBeVisible();
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(64);
  expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(64);

  await start.tap();
  await expect.poll(() => requests).toContain('/orders/order-touch-1/start-preparation');
  expect(requests).toHaveLength(1);
});
