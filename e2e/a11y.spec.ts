import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedAuthSession, setDocumentTheme } from './fixtures/authSession.ts';
import {
  makeItem,
  makeOrder,
  makeRejectedOrder,
  mockOrdersAndKdsRoutes,
} from './fixtures/orderFixtures.ts';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface AxeSummaryEntry {
  readonly scenario: string;
  readonly violationsCount: number;
  readonly violations: unknown[];
}

const collectedReports: AxeSummaryEntry[] = [];

async function runAxeAudit(
  page: Page,
  scenario: string,
  includeSelector?: string,
): Promise<void> {
  // Wait for finite entrance CSS animations (e.g. button pop opacity) to settle before measuring contrast
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
  collectedReports.push({
    scenario,
    violationsCount: results.violations.length,
    violations: results.violations,
  });

  expect(
    results.violations,
    `Violaciones WCAG 2.1 AA en "${scenario}": ${JSON.stringify(results.violations, null, 2)}`,
  ).toEqual([]);
}

async function auditOrderTicketStates(
  page: Page,
  themeLabel: 'light' | 'dark',
): Promise<void> {
  // 1. CREATED (solo lectura)
  await page.getByTestId('table-order-chip-a11y-created').click();
  await expect(page.getByRole('heading', { name: 'Orden #11' })).toBeVisible();
  await runAxeAudit(page, `OrderTicket CREATED lectura (${themeLabel})`, '.orders-kds-root');

  // 2. CREATED (modo edición)
  await page.getByRole('button', { name: 'Modificar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  await runAxeAudit(page, `OrderTicket CREATED edición (${themeLabel})`, '.orders-kds-root');
  await page.getByRole('button', { name: 'Descartar' }).click();

  // 3. RESERVED
  await page.getByTestId('table-order-chip-a11y-reserved').click();
  await expect(page.getByRole('heading', { name: 'Orden #12' })).toBeVisible();
  await runAxeAudit(page, `OrderTicket RESERVED (${themeLabel})`, '.orders-kds-root');

  // 4. EXPIRED (Caducada)
  await page.getByTestId('table-order-chip-a11y-expired').click();
  await expect(page.getByRole('heading', { name: 'Orden #13' })).toBeVisible();
  await runAxeAudit(page, `OrderTicket EXPIRED (${themeLabel})`, '.orders-kds-root');

  // 5. REJECTED (aria-live & RejectionBreakdown)
  await page.getByTestId('table-order-chip-a11y-rejected').click();
  await expect(page.getByTestId('rejection-reason-banner')).toBeVisible();
  await runAxeAudit(
    page,
    `OrderTicket REJECTED con desglose (${themeLabel})`,
    '.orders-kds-root',
  );
}

test.describe('RNF-11 — Auditoría WCAG 2.1 AA (claro y [data-theme="dark"])', () => {
  test.afterAll(() => {
    fs.mkdirSync('axe-report', { recursive: true });
    fs.writeFileSync(
      'axe-report/axe-report.json',
      JSON.stringify({ generatedAt: new Date().toISOString(), audits: collectedReports }, null, 2),
    );
  });

  test('OrderTicketWidget cumple WCAG 2.1 AA en CREATED (lectura/edición), RESERVED, EXPIRED y REJECTED en tema claro y [data-theme="dark"]', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const createdOrd = makeOrder({ id: 'a11y-created', orderNumber: 11, status: 'CREATED' });
    const reservedOrd = makeOrder({ id: 'a11y-reserved', orderNumber: 12, status: 'RESERVED' });
    const expiredOrd = makeOrder({ id: 'a11y-expired', orderNumber: 13, status: 'EXPIRED' });
    const rejectedOrd = makeRejectedOrder('a11y-rejected');

    await seedAuthSession(page, { role: 'waiter', theme: 'light' });
    await mockOrdersAndKdsRoutes(page, [createdOrd, reservedOrd, expiredOrd, rejectedOrd]);
    await page.goto('/');

    await auditOrderTicketStates(page, 'light');

    await setDocumentTheme(page, 'dark');
    await expect
      .poll(() =>
        page
          .locator('.orders-kds-root .order-ticket')
          .evaluate((el) => window.getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(22, 19, 17)'); // --color-surface en [data-theme="dark"] (#161311)

    await auditOrderTicketStates(page, 'dark');
  });

  test('KDS Board y modales cumplen WCAG 2.1 AA en tema claro y [data-theme="dark"]', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const past26m = new Date(Date.now() - 26 * 60 * 1000).toISOString();
    const activeOrd = makeOrder({
      id: 'a11y-kds-prep',
      orderNumber: 201,
      status: 'IN_PREPARATION',
      items: [makeItem({ id: 'a11y-it-1', name: 'Cochinita' })],
    });
    const expiredOrd = makeOrder({
      id: 'a11y-kds-exp',
      orderNumber: 202,
      status: 'RESERVED',
      stockReservedAt: past26m,
    });

    await seedAuthSession(page, { role: 'admin', theme: 'light' });
    await mockOrdersAndKdsRoutes(page, [activeOrd, expiredOrd]);
    await page.goto('/');

    await expect(page.getByTestId('order-card-a11y-kds-prep')).toBeVisible();
    await runAxeAudit(page, 'KDS cola activa (light)', '.orders-kds-root');

    // Cambiar dinámicamente a tema oscuro
    await setDocumentTheme(page, 'dark');
    await runAxeAudit(page, 'KDS cola activa (dark)', '.orders-kds-root');

    // Pestaña Caducados en tema oscuro
    await page.getByTestId('tab-expired').click();
    await runAxeAudit(page, 'KDS Caducados (dark)', '.orders-kds-root');

    // Modal OrderDetailsDialog en tema oscuro
    await page.getByTestId('tab-active-view').click();
    await page.getByTestId('order-id-a11y-kds-prep').click();
    await expect(page.getByTestId('order-details-dialog')).toBeVisible();
    await runAxeAudit(page, 'OrderDetailsDialog (dark)', '[data-testid="order-details-dialog"]');
  });

  test('KDS 1920x1080 cumple WCAG 2.1 AA en todas las variantes de tarjeta, semáforo y pestañas (claro y [data-theme="dark"])', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const nowMs = Date.now();
    const reservedOnTime = makeOrder({
      id: 'a11y-1080-reserved',
      orderNumber: 301,
      tableNumber: 7,
      status: 'RESERVED',
      stockReservedAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
      items: [makeItem({ id: 'it-1080-1', name: 'Panuchos de Pavo', status: 'PENDING' })],
    });
    const prepWarningTakeaway = makeOrder({
      id: 'a11y-1080-warning',
      orderNumber: 302,
      tableNumber: null,
      isTakeaway: true,
      status: 'IN_PREPARATION',
      stockReservedAt: new Date(nowMs - 12 * 60 * 1000).toISOString(),
      inPreparationAt: new Date(nowMs - 12 * 60 * 1000).toISOString(),
      items: [makeItem({ id: 'it-1080-2', name: 'Sopa de Lima', status: 'PENDING' })],
    });
    const prepLateMixed = makeOrder({
      id: 'a11y-1080-late',
      orderNumber: 303,
      tableNumber: 9,
      status: 'IN_PREPARATION',
      stockReservedAt: new Date(nowMs - 19 * 60 * 1000).toISOString(),
      inPreparationAt: new Date(nowMs - 19 * 60 * 1000).toISOString(),
      items: [
        makeItem({ id: 'it-1080-3a', name: 'Salbutes', status: 'READY' }),
        makeItem({ id: 'it-1080-3b', name: 'Agua de Jamaica', status: 'PENDING' }),
      ],
    });
    const redoDelivered = makeOrder({
      id: 'a11y-1080-redo',
      orderNumber: 304,
      tableNumber: 12,
      status: 'DELIVERED',
      stockReservedAt: new Date(nowMs - 8 * 60 * 1000).toISOString(),
      inPreparationAt: new Date(nowMs - 7 * 60 * 1000).toISOString(),
      items: [
        makeItem({ id: 'it-1080-4a', name: 'Poc Chuc', status: 'DELIVERED' }),
        makeItem({ id: 'it-1080-4b', name: 'Relleno Negro', status: 'PENDING', notes: 'Sin huevo' }),
      ],
    });
    const deliveredHistory = makeOrder({
      id: 'a11y-1080-delivered',
      orderNumber: 305,
      tableNumber: 15,
      status: 'DELIVERED',
      stockReservedAt: new Date(nowMs - 20 * 60 * 1000).toISOString(),
      inPreparationAt: new Date(nowMs - 18 * 60 * 1000).toISOString(),
      items: [makeItem({ id: 'it-1080-5', name: 'Queso Relleno', status: 'DELIVERED' })],
    });
    const expiredCard = makeOrder({
      id: 'a11y-1080-expired',
      orderNumber: 306,
      tableNumber: 18,
      status: 'RESERVED',
      stockReservedAt: new Date(nowMs - 26 * 60 * 1000).toISOString(),
      items: [makeItem({ id: 'it-1080-6', name: 'Tzic de Venado', status: 'PENDING' })],
    });

    await seedAuthSession(page, { role: 'admin', theme: 'light' });
    await mockOrdersAndKdsRoutes(page, [
      reservedOnTime,
      prepWarningTakeaway,
      prepLateMixed,
      redoDelivered,
      deliveredHistory,
      expiredCard,
    ]);
    await page.goto('/');

    await expect(page.getByTestId('order-card-a11y-1080-reserved')).toBeVisible();
    await expect(page.getByTestId('order-card-a11y-1080-warning')).toBeVisible();
    await expect(page.getByTestId('order-card-a11y-1080-late')).toBeVisible();
    await expect(page.getByTestId('order-card-a11y-1080-redo')).toBeVisible();

    for (const themeLabel of ['light', 'dark'] as const) {
      if (themeLabel === 'dark') {
        await setDocumentTheme(page, 'dark');
      }
      await page.getByTestId('tab-active-view').click();
      await runAxeAudit(page, `KDS 1080p variantes (${themeLabel})`, '.orders-kds-root');

      await page.getByTestId('tab-redo-view').click();
      await runAxeAudit(page, `KDS 1080p Rehechuras (${themeLabel})`, '.orders-kds-root');

      await page.getByTestId('tab-delivered').click();
      await runAxeAudit(page, `KDS 1080p Entregadas (${themeLabel})`, '.orders-kds-root');

      await page.getByTestId('tab-expired').click();
      await runAxeAudit(page, `KDS 1080p Caducados (${themeLabel})`, '.orders-kds-root');
    }
  });
});
