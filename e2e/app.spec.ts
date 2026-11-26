import { test, expect } from '@playwright/test';
import { seedAuthSession } from './fixtures/authSession.ts';
import { makeDefaultOpenShiftResponse } from './fixtures/orderFixtures.ts';

test('verify page title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/temp-app/);
});

test('production remote ignores a localStorage session without Shell props', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fmat_restaurant_auth_session',
      JSON.stringify({
        accessToken: 'e2e-stored-token',
        user: { id: 'e2e-stored-user', roles: ['kitchen'], permissions: ['kitchen:queues:view'] },
      }),
    );
  });
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByTestId('auth-required-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sesión requerida' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'KDS App' })).toHaveCount(0);
});

test('Vite preview returns restrictive CSP and non-wildcard CORS headers', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:4173/', {
    headers: { Origin: 'http://127.0.0.1:5173' },
  });

  expect(response.ok()).toBe(true);
  const headers = response.headers();
  const csp = headers['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain('connect-src');
  expect(csp).toContain('ws://127.0.0.1:8000');
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).not.toContain('unsafe-inline');
  expect(csp.split(';').find((directive) => directive.trim().startsWith('script-src'))).not.toContain(
    "'unsafe-inline'",
  );
  expect(csp.split(';').find((directive) => directive.trim().startsWith('style-src'))).not.toContain(
    "'unsafe-inline'",
  );
  expect(headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  expect(headers['access-control-allow-origin']).not.toBe('*');

  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const staticResponse = await request.get(`http://127.0.0.1:4173${path}`);
    const staticCsp = staticResponse.headers()['content-security-policy'];
    expect(staticCsp, `${path} CSP`).toBeDefined();
    const staticStyleSrc = staticCsp
      ?.split(';')
      .find((directive) => directive.trim().startsWith('style-src'));
    expect(
      staticStyleSrc,
      `${path} style-src`,
    ).toBeDefined();
    expect(staticStyleSrc, `${path} style-src`).not.toContain("'unsafe-inline'");
  }

  const blockedOriginResponse = await request.get('http://127.0.0.1:4173/', {
    headers: { Origin: 'https://unauthorized.example' },
  });
  expect(blockedOriginResponse.headers()['access-control-allow-origin']).not.toBe(
    'https://unauthorized.example',
  );
});

test('KDS touch shell @touch', async ({ page }) => {
  await seedAuthSession(page, { role: 'kitchen' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KDS App' })).toBeVisible();
  await expect(page.getByTestId('kds-board-container')).toBeVisible();
});

test('KDS actions use one touch and 64px targets @touch', async ({ page }) => {
  await seedAuthSession(page, { role: 'kitchen' });
  const requests: string[] = [];
  await page.route('**/orders/order-touch-1/**', async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 204 });
  });
  await page.route('**/shifts/current*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(makeDefaultOpenShiftResponse()),
    }),
  );
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

  await page.goto('/');
  const start = page.getByTestId('order-action-start-order-touch-1');
  const item = page.getByTestId('order-item-item-touch-1');
  await expect(start).toBeVisible();
  await expect(item).toBeVisible();
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(64);
  expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(64);

  await start.tap();
  await expect
    .poll(() =>
      requests.some((pathname) => pathname.endsWith('/orders/order-touch-1/start-preparation')),
    )
    .toBe(true);
  expect(requests).toHaveLength(1);
});
