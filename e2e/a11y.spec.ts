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
});
