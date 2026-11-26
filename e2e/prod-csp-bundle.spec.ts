import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { assertMinTouchBox, assertNoHorizontalOverflow } from './fixtures/containerHarness.ts';
import {
  makeItem,
  makeOrder,
  makeRejectedOrder,
  mockOrdersAndKdsRoutes,
} from './fixtures/orderFixtures.ts';

const PROD_ORIGIN = 'http://127.0.0.1:4173';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface CapturedCspViolation {
  readonly blockedURI: string;
  readonly violatedDirective: string;
  readonly effectiveDirective: string;
}

interface MountShellProps {
  readonly token: string;
  readonly theme: 'light' | 'dark';
  readonly currentUser: {
    readonly id: string;
    readonly userType?: 'ADMIN' | 'STAFF';
    readonly roles: string[];
    readonly permissions: string[];
  };
}

function resolveFederationImportChunk(): string {
  const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
  const files = fs.readdirSync(assetsDir);
  const fnImportFile = files.find((file) => /^__federation_fn_import-[^.]+\.js$/.test(file));

  if (!fnImportFile) {
    throw new Error(`Missing __federation_fn_import chunk in ${assetsDir}`);
  }

  return fnImportFile;
}

async function installCspViolationCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: Array<{
      blockedURI: string;
      violatedDirective: string;
      effectiveDirective: string;
    }> = [];
    (window as Window & { __cspViolations?: typeof violations }).__cspViolations = violations;

    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
      });
    });
  });
}

async function getRelevantCspViolations(page: Page): Promise<CapturedCspViolation[]> {
  const all = await page.evaluate(
    () => (window as Window & { __cspViolations?: CapturedCspViolation[] }).__cspViolations ?? [],
  );
  return all.filter(
    (violation) =>
      violation.blockedURI === 'inline' ||
      violation.blockedURI === 'eval' ||
      violation.blockedURI === '' ||
      violation.blockedURI.startsWith('http://127.0.0.1:4173') ||
      violation.blockedURI.startsWith('http://localhost:4173'),
  );
}

async function assertZeroRelevantCspViolations(page: Page, context: string): Promise<void> {
  const violations = await getRelevantCspViolations(page);
  expect(
    violations,
    `Unexpected CSP violations during "${context}": ${JSON.stringify(violations)}`,
  ).toEqual([]);
}

async function mountProductionApp(page: Page, props: MountShellProps): Promise<void> {
  const fnImportFile = resolveFederationImportChunk();

  await page.goto(`${PROD_ORIGIN}/`);
  await expect(page.getByTestId('auth-required-screen')).toBeVisible();

  await page.evaluate(
    async ({ federationImportChunk, shellProps }) => {
      interface FederationImportLike {
        importShared: (name: string) => Promise<unknown>;
      }
      interface ReactLike {
        default?: {
          createElement: (
            component: unknown,
            componentProps: Record<string, unknown>,
          ) => unknown;
        };
        createElement?: (
          component: unknown,
          componentProps: Record<string, unknown>,
        ) => unknown;
      }
      interface ReactDomLike {
        default?: {
          createRoot: (container: HTMLElement) => { render: (element: unknown) => void };
        };
        createRoot?: (container: HTMLElement) => { render: (element: unknown) => void };
      }
      interface RemoteEntryLike {
        init: (shareScope: Record<string, unknown>) => Promise<void> | void;
        get: (modulePath: string) => Promise<() => unknown>;
      }

      const fnImportUrl = `/assets/${federationImportChunk}`;
      const remoteEntryUrl = '/assets/remoteEntry.js';

      const [fnImport, remote] = (await Promise.all([
        import(fnImportUrl),
        import(remoteEntryUrl),
      ])) as [FederationImportLike, RemoteEntryLike];

      await remote.init({});
      const [reactMod, reactDomMod, moduleFactory] = (await Promise.all([
        fnImport.importShared('react'),
        fnImport.importShared('react-dom'),
        remote.get('./App'),
      ])) as [ReactLike, ReactDomLike, () => unknown];

      const createElement = reactMod.createElement ?? reactMod.default?.createElement;
      const createRoot = reactDomMod.createRoot ?? reactDomMod.default?.createRoot;
      if (!createElement || !createRoot) {
        throw new Error('Unable to resolve React createElement / ReactDOM createRoot from production chunks');
      }

      const ProdApp = moduleFactory();

      document.getElementById('root')?.remove();
      const hostContainer = document.createElement('div');
      hostContainer.id = 'prod-mfe-host';
      document.body.appendChild(hostContainer);

      if (shellProps.theme === 'dark') {
        document.documentElement.dataset.theme = 'dark';
      } else {
        delete document.documentElement.dataset.theme;
      }

      createRoot(hostContainer).render(
        createElement(ProdApp, shellProps as unknown as Record<string, unknown>),
      );
    },
    { federationImportChunk: fnImportFile, shellProps: props },
  );
}

async function runAxeCheck(page: Page, scenario: string, includeSelector?: string): Promise<void> {
  await page.evaluate(async () => {
    const finiteAnims = document
      .getAnimations()
      .filter((anim) => anim.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.allSettled(finiteAnims.map((anim) => anim.finished));
  });

  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (includeSelector) {
    builder.include(includeSelector);
  }
  const results = await builder.analyze();
  expect(
    results.violations,
    `WCAG 2.1 AA violations in "${scenario}" on :4173: ${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

test.describe('Production Bundle (:4173) — Strict CSP, CORS Allowlist & WCAG 2.1 AA', () => {
  test('production :4173 serves strict CSP and allows Shell (:3000) and MFE origins on / and /assets/remoteEntry.js without wildcard', async ({
    request,
  }) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5177',
    ];

    for (const origin of allowedOrigins) {
      for (const endpoint of ['/', '/assets/remoteEntry.js']) {
        const res = await request.get(`${PROD_ORIGIN}${endpoint}`, {
          headers: { Origin: origin },
        });
        expect(res.ok(), `${endpoint} for ${origin}`).toBe(true);
        const headers = res.headers();
        expect(headers['access-control-allow-origin']).toBe(origin);
        expect(headers['access-control-allow-origin']).not.toBe('*');

        const csp = headers['content-security-policy'];
        expect(csp).toBeDefined();
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).not.toContain('unsafe-eval');
      }
    }

    const blocked = await request.get(`${PROD_ORIGIN}/assets/remoteEntry.js`, {
      headers: { Origin: 'https://unauthorized.example' },
    });
    expect(blocked.headers()['access-control-allow-origin']).not.toBe('https://unauthorized.example');
    expect(blocked.headers()['access-control-allow-origin']).not.toBe('*');
  });

  test('production UnauthenticatedSessionView renders under strict CSP with 0 inline violations and passes WCAG 2.1 AA', async ({
    page,
  }) => {
    await installCspViolationCollector(page);
    await page.goto(`${PROD_ORIGIN}/`);

    const authScreen = page.getByTestId('auth-required-screen');
    await expect(authScreen).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sesión requerida' })).toBeVisible();

    // Bundled CSS (no inline style injection) styles .orders-kds-root .bg-surface (#FFFFFF -> rgb(255, 255, 255))
    const cardBgColor = await authScreen
      .locator('.bg-surface')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(cardBgColor).toBe('rgb(255, 255, 255)');

    await assertZeroRelevantCspViolations(page, 'UnauthenticatedSessionView');
    await runAxeCheck(page, 'UnauthenticatedSessionView (:4173)', '.orders-kds-root');
  });

  test('production federated KDS (./App via remoteEntry.js) renders active board, pagination, OrderDetailsDialog scroll-lock, and dark theme with 0 CSP violations and 0 WCAG violations', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const nowMs = Date.now();
    const orders = [
      makeOrder({
        id: 'prod-kds-reserved',
        orderNumber: 801,
        tableNumber: 3,
        status: 'RESERVED',
        stockReservedAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
        items: [makeItem({ id: 'prod-it-1', name: 'Cochinita Pibil', station: 'plancha' })],
      }),
      makeOrder({
        id: 'prod-kds-prep',
        orderNumber: 802,
        tableNumber: 7,
        status: 'IN_PREPARATION',
        stockReservedAt: new Date(nowMs - 14 * 60 * 1000).toISOString(),
        inPreparationAt: new Date(nowMs - 12 * 60 * 1000).toISOString(),
        items: [makeItem({ id: 'prod-it-2', name: 'Sopa de Lima', station: 'caliente' })],
      }),
      ...Array.from({ length: 7 }, (_, idx) =>
        makeOrder({
          id: `prod-kds-extra-${idx + 1}`,
          orderNumber: 810 + idx,
          tableNumber: 10 + idx,
          status: 'RESERVED',
          items: [makeItem({ id: `prod-it-extra-${idx + 1}`, name: `Platillo ${idx + 1}` })],
        }),
      ),
    ];

    await installCspViolationCollector(page);
    await mockOrdersAndKdsRoutes(page, orders);
    await mountProductionApp(page, {
      token: 'prod-e2e-shell-token-admin',
      theme: 'light',
      currentUser: {
        id: '00000000-0000-0000-0000-000000000001',
        userType: 'ADMIN',
        roles: ['admin'],
        permissions: ['*'],
      },
    });

    await expect(page.getByTestId('kds-board-container')).toBeVisible();
    await expect(page.getByTestId('kds-active-order-count')).toHaveText('Comandas activas: 9');
    await expect(page.getByTestId('kds-additional-pages')).toBeVisible();

    await page.getByTestId('order-id-prod-kds-prep').click();
    await expect(page.getByTestId('order-details-dialog')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.body.classList.contains('orders-kds-scroll-locked')),
      )
      .toBe(true);
    await page.getByTestId('order-details-bottom-close-btn').click();
    await expect(page.getByTestId('order-details-dialog')).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => document.body.classList.contains('orders-kds-scroll-locked')),
      )
      .toBe(false);

    await assertZeroRelevantCspViolations(page, 'KDS light (:4173)');
    await runAxeCheck(page, 'KDS cola activa light (:4173)', '.orders-kds-root');

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await assertZeroRelevantCspViolations(page, 'KDS dark (:4173)');
    await runAxeCheck(page, 'KDS cola activa dark (:4173)', '.orders-kds-root');
  });

  test('production federated OrderTicketWidget (./App via remoteEntry.js) adapts container layouts with 0 CSP violations and 0 WCAG violations', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const createdOrd = makeOrder({ id: 'prod-ticket-created', orderNumber: 901, status: 'CREATED' });
    const reservedOrd = makeOrder({ id: 'prod-ticket-reserved', orderNumber: 902, status: 'RESERVED' });
    const expiredOrd = makeOrder({ id: 'prod-ticket-expired', orderNumber: 903, status: 'EXPIRED' });
    const rejectedOrd = makeRejectedOrder('prod-ticket-rejected');

    await installCspViolationCollector(page);
    await mockOrdersAndKdsRoutes(page, [createdOrd, reservedOrd, expiredOrd, rejectedOrd]);
    await page.setViewportSize({ width: 360, height: 800 });

    await mountProductionApp(page, {
      token: 'prod-e2e-shell-token-waiter',
      theme: 'light',
      currentUser: {
        id: '00000000-0000-0000-0000-000000000002',
        roles: ['waiter'],
        permissions: [
          'orders:orders:view',
          'orders:orders:create',
          'orders:orders:update',
          'orders:orders:confirm',
        ],
      },
    });

    const ticket = page.locator('.orders-kds-root .order-ticket');
    await expect(ticket).toBeVisible();
    await assertNoHorizontalOverflow(ticket, 'Production OrderTicket @360px');

    await page.setViewportSize({ width: 1024, height: 800 });
    await assertNoHorizontalOverflow(ticket, 'Production OrderTicket @1024px');

    await page.getByTestId('table-order-chip-prod-ticket-created').click();
    await expect(page.getByRole('heading', { name: 'Orden #901' })).toBeVisible();

    await page.getByTestId('table-order-chip-prod-ticket-reserved').click();
    await expect(page.getByRole('heading', { name: 'Orden #902' })).toBeVisible();

    await page.getByTestId('table-order-chip-prod-ticket-expired').click();
    await expect(page.getByRole('heading', { name: 'Orden #903' })).toBeVisible();

    await page.getByTestId('table-order-chip-prod-ticket-rejected').click();
    await expect(page.getByTestId('rejection-reason-banner')).toBeVisible();

    await assertZeroRelevantCspViolations(page, 'OrderTicketWidget (:4173)');
    await runAxeCheck(page, 'OrderTicketWidget REJECTED (:4173)', '.orders-kds-root');
  });

  test('production federated KDS touch targets >= 64px without overflow under strict CSP @touch', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const pendingOrder = makeOrder({
      id: 'prod-touch-pending',
      orderNumber: 951,
      status: 'RESERVED',
      items: [makeItem({ id: 'prod-touch-it-1', name: 'Panuchos de Pavo', station: 'plancha' })],
    });
    const prepOrder = makeOrder({
      id: 'prod-touch-prep',
      orderNumber: 952,
      status: 'IN_PREPARATION',
      items: [makeItem({ id: 'prod-touch-it-2', name: 'Relleno Negro', station: 'caliente' })],
    });

    await installCspViolationCollector(page);
    await mockOrdersAndKdsRoutes(page, [pendingOrder, prepOrder]);
    await mountProductionApp(page, {
      token: 'prod-e2e-shell-token-kitchen',
      theme: 'light',
      currentUser: {
        id: '00000000-0000-0000-0000-000000000003',
        roles: ['kitchen'],
        permissions: [
          'kitchen:queues:view',
          'kitchen:orders:start_preparation',
          'kitchen:items:ready',
          'kitchen:orders:ready',
        ],
      },
    });

    await page.getByTestId('station-tab-plancha').tap();
    await assertMinTouchBox(page.getByTestId('order-action-start-prod-touch-pending'), 64, 64);
    await assertMinTouchBox(page.getByTestId('order-action-reject-prod-touch-pending'), 64, 64);
    await assertMinTouchBox(page.getByTestId('order-item-prod-touch-it-1'), 64, 64);

    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflowX).toBe(false);
    await assertZeroRelevantCspViolations(page, 'KDS touch (:4173)');
  });
});
