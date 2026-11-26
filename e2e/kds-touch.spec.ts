import { expect, test } from '@playwright/test';
import { seedAuthSession, setDocumentTheme } from './fixtures/authSession.ts';
import { assertMinTouchBox } from './fixtures/containerHarness.ts';
import {
  makeDefaultOpenShiftResponse,
  makeItem,
  makeOrder,
  mockOrdersAndKdsRoutes,
} from './fixtures/orderFixtures.ts';

const FIXED_NOW = new Date('2026-11-14T18:00:00Z');

test.describe('ST-18(a) — KDS Táctil, TTL/Caducados, Debounce 400ms, Undo 15s y Dark Theme @touch', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`cumple targets >= 64px en viewport ${viewport.width}x${viewport.height} sin overflow horizontal @touch`, async ({
      page,
    }) => {
      const pendingOrder = makeOrder({
        id: 'ord-kds-64-pending',
        orderNumber: 501,
        status: 'RESERVED',
        items: [makeItem({ id: 'item-kds-1', name: 'Cochinita', station: 'plancha' })],
      });
      const inPrepOrder = makeOrder({
        id: 'ord-kds-64-prep',
        orderNumber: 502,
        status: 'IN_PREPARATION',
        items: [makeItem({ id: 'item-kds-2', name: 'Sopa de Lima', station: 'caliente' })],
      });
      // Llenar <= 4 tarjetas visibles por página (!isCompactLayout) y > 8 total para habilitar paginación
      const extraOrders = Array.from({ length: 7 }, (_, idx) =>
        makeOrder({
          id: `ord-kds-extra-${idx + 1}`,
          orderNumber: 510 + idx,
          status: 'RESERVED',
          items: [makeItem({ id: `it-extra-${idx + 1}`, name: `Platillo ${idx + 1}` })],
        }),
      );

      await page.setViewportSize(viewport);
      await seedAuthSession(page, { role: 'kitchen' });
      await mockOrdersAndKdsRoutes(page, [pendingOrder, inPrepOrder, ...extraOrders]);
      await page.goto('/');

      // Validar altura táctil responsiva del selector de estación (48px base, 52px sm+, 56px xl+ máx.)
      const expectedStationMinHeight = viewport.width >= 1280 ? 56 : 52;
      await assertMinTouchBox(page.getByTestId('station-tab-general'), expectedStationMinHeight, 48);
      await assertMinTouchBox(page.getByTestId('station-tab-plancha'), expectedStationMinHeight, 48);
      await assertMinTouchBox(page.getByTestId('station-tab-caliente'), expectedStationMinHeight, 48);

      // En tab 'active' (default), pageSize=8 -> si hay > 4 cards visibles, KdsBoard activa isCompactLayout (48px).
      // Filtramos a estación 'plancha' (1 tarjeta) para validar tarjetas no compactas >= 64px:
      await page.getByTestId('station-tab-plancha').tap();
      await assertMinTouchBox(page.getByTestId('order-action-start-ord-kds-64-pending'), 64, 64);
      await assertMinTouchBox(page.getByTestId('order-action-reject-ord-kds-64-pending'), 64, 64);
      await assertMinTouchBox(page.getByTestId('order-item-item-kds-1'), 64, 64);

      // Comprobar "Comanda lista" >= 64x64 px filtrando a estación 'caliente'
      await page.getByTestId('station-tab-caliente').tap();
      await assertMinTouchBox(page.getByTestId('order-action-ready-ord-kds-64-prep'), 64, 64);

      // Volver a 'Todas' y comprobar paginación >= 64x64 px y ausencia de scroll horizontal de página
      await page.getByTestId('station-tab-general').tap();
      await expect(page.getByTestId('kds-active-order-count')).toHaveText('Comandas activas: 9');
      await expect(page.getByTestId('kds-additional-pages')).toBeVisible();
      await assertMinTouchBox(page.getByTestId('pagination-next'), 64, 64);
      await assertMinTouchBox(page.getByTestId('pagination-prev'), 64, 64);

      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflowX).toBe(false);
    });
  }

  test('gestiona TTL 15 min y transición automática tras 10 min de gracia hacia pestaña Caducados @touch', async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_NOW });

    const elapsed2Min = new Date(FIXED_NOW.getTime() - 2 * 60 * 1000).toISOString();
    const elapsed16Min = new Date(FIXED_NOW.getTime() - 16 * 60 * 1000).toISOString();

    const freshReserved = makeOrder({
      id: 'ord-ttl-fresh',
      orderNumber: 601,
      status: 'RESERVED',
      stockReservedAt: elapsed2Min,
      items: [makeItem({ id: 'it-fresh', name: 'Salbutes' })],
    });
    const inGraceReserved = makeOrder({
      id: 'ord-ttl-grace',
      orderNumber: 602,
      status: 'RESERVED',
      stockReservedAt: elapsed16Min,
      items: [makeItem({ id: 'it-grace', name: 'Panuchos' })],
    });

    await seedAuthSession(page, { role: 'kitchen' });
    await mockOrdersAndKdsRoutes(page, [freshReserved, inGraceReserved]);
    await page.goto('/');

    // Cambiar a la pestaña "Pendientes" donde se gobierna la ventana de gracia de 10 min (KDS_EXPIRED_GRACE_MS)
    await page.getByTestId('tab-pending').tap();

    // 1. La orden en gracia (16 min > 15 min TTL) muestra alerta con cuenta regresiva, bloquea "Iniciar preparación" y permanece en Pendientes
    const alertBanner = page.getByTestId('order-ttl-expired-alert-ord-ttl-grace');
    await expect(alertBanner).toContainText('Tiempo límite agotado — Cocina no confirmó a tiempo');
    await expect(alertBanner).toContainText(/Pasando a Caducados en \d+m \d{2}s/);
    await expect(page.getByTestId('order-action-start-ord-ttl-grace')).toBeDisabled();
    await expect(page.getByTestId('order-action-start-ord-ttl-fresh')).toBeEnabled();
    await expect(page.getByTestId('pending-badge')).toHaveText('2');

    // 2. Avanzar +10 min en el reloj virtual:
    //    - freshReserved pasa de 2m a 12m (< 15m TTL, sigue activa en Pendientes)
    //    - inGraceReserved pasa de 16m a 26m (> 15 + 10 = 25m) -> se retira automáticamente de Pendientes y queda en Caducados
    await page.clock.fastForward(10 * 60 * 1000);

    await expect(page.getByTestId('order-card-ord-ttl-grace')).toBeHidden();
    await expect(page.getByTestId('pending-badge')).toHaveText('1');
    await expect(page.getByTestId('expired-badge')).toHaveText('1');

    await page.getByTestId('tab-expired').tap();
    await expect(page.getByTestId('order-card-ord-ttl-grace')).toBeVisible();
  });

  test('protege contra doble toque (< 400 ms) y ejecuta Undo dentro de la ventana de 15 s @touch', async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_NOW });

    const inPrepOrd = makeOrder({
      id: 'ord-undo-1',
      orderNumber: 701,
      status: 'IN_PREPARATION',
      items: [makeItem({ id: 'it-u1', name: 'Poc Chuc' })],
    });

    await seedAuthSession(page, { role: 'kitchen' });
    const { calls } = await mockOrdersAndKdsRoutes(page, [inPrepOrd]);
    await page.goto('/');

    // Toque en "Comanda lista": pointerAction suprime ghost click inmediato (< 400ms)
    const readyBtn = page.getByTestId('order-action-ready-ord-undo-1');
    await readyBtn.tap();

    const undoBanner = page.getByTestId('order-undo-ready-ord-undo-1');
    const undoBtn = page.getByTestId('order-action-undo-ready-ord-undo-1');
    await expect(undoBanner).toBeVisible();
    await expect(page.getByTestId('order-undo-countdown-ord-undo-1')).toContainText('15s');

    // Ghost click dentro de los 400 ms sobre el botón recién montado debe ser ignorado por pointerAction
    await undoBtn.dispatchEvent('click');
    await expect(undoBanner).toBeVisible();

    // Cancelar deliberadamente dentro de los 15 s: NO debe enviarse PATCH /ready
    await undoBtn.tap();
    await expect(page.getByTestId('order-action-ready-ord-undo-1')).toBeVisible();
    expect(calls.filter((c) => c.pathname.endsWith('/ready'))).toHaveLength(0);

    // Volver a marcar lista y dejar expirar los 15 s reales con page.clock
    await page.getByTestId('order-action-ready-ord-undo-1').tap();
    await page.clock.fastForward(15_500);

    await expect
      .poll(() => calls.filter((c) => c.pathname === '/orders/ord-undo-1/ready').length)
      .toBe(1);
  });

  test('bloquea scroll del body al abrir OrderDetailsDialog y lo restaura al cerrar @touch', async ({
    page,
  }) => {
    const order = makeOrder({
      id: 'ord-modal-lock',
      orderNumber: 801,
      status: 'IN_PREPARATION',
      items: [makeItem({ id: 'it-m1', name: 'Tamal Colado' })],
    });

    await seedAuthSession(page, { role: 'kitchen' });
    await mockOrdersAndKdsRoutes(page, [order]);
    await page.goto('/');

    // Abrir modal tocando la cabecera/identificador de la tarjeta
    await page.getByTestId('order-id-ord-modal-lock').tap();
    await expect(page.getByTestId('order-details-dialog')).toBeVisible();

    const bodyOverflowOpen = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflowOpen).toBe('hidden');

    await page.getByTestId('order-details-close-btn').tap();
    await expect(page.getByTestId('order-details-dialog')).toBeHidden();

    const bodyOverflowClosed = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflowClosed).not.toBe('hidden');
  });

  test('soporta tema oscuro dinámico [data-theme="dark"] y toggle chargeCustomer en AdminVoidDialog @touch', async ({
    page,
  }) => {
    const order = makeOrder({
      id: 'ord-dark-void',
      orderNumber: 901,
      status: 'IN_PREPARATION',
      items: [makeItem({ id: 'it-dv-1', name: 'Relleno Negro' })],
    });

    await seedAuthSession(page, { role: 'admin', theme: 'light' });
    const { calls } = await mockOrdersAndKdsRoutes(page, [order]);
    await page.goto('/');

    const board = page.getByTestId('kds-board-container');
    await expect(board).toBeVisible();

    await setDocumentTheme(page, 'dark');
    await expect
      .poll(() => board.evaluate((el) => window.getComputedStyle(el).backgroundColor))
      .toBe('rgb(10, 9, 8)'); // --color-canvas en [data-theme="dark"] (#0A0908)

    // Probar AdminVoidDialog con switch chargeCustomer en razón personalizada
    await page.getByTestId('order-action-admin-void-ord-dark-void').tap();
    await expect(page.getByTestId('admin-void-dialog')).toBeVisible();

    await page.getByTestId('admin-void-toggle-custom-reason').tap();
    await page.getByTestId('admin-void-custom-reason-input').fill('Error de entrega sin cobro');

    const chargeSwitch = page.getByTestId('admin-void-charge-toggle');
    await expect(chargeSwitch).toHaveAttribute('aria-checked', 'true');
    await chargeSwitch.tap();
    await expect(chargeSwitch).toHaveAttribute('aria-checked', 'false');

    await page.getByTestId('admin-void-confirm').tap();

    await expect
      .poll(() => calls.find((c) => c.pathname === '/orders/ord-dark-void/void')?.body)
      .toEqual({
        reason: 'Error de entrega sin cobro',
        chargeCustomer: false,
      });
  });

  test('muestra banner resiliente ante fallo de red en /kds/queue y diagnósticos DEV en :5173 @touch', async ({
    page,
  }) => {
    // 1. Prueba sobre preview (:4173): no usamos page.clock congelado para que los 2 reintentos de React Query concluyan
    await seedAuthSession(page, { role: 'kitchen' });
    await page.routeWebSocket(/\/ws\/(waiter|kds)/, (ws) => {
      ws.onMessage(() => {});
    });
    await page.route('**/shifts/current*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeDefaultOpenShiftResponse()),
      }),
    );
    await page.route('**/kds/queue*', (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.getByTestId('kds-error')).toContainText(
      'Error al cargar comandas. Verifique su conexión',
      { timeout: 12_000 },
    );

    // 2. Prueba contra dev server (:5173) donde import.meta.env.DEV === true para validar devErrorLogger.ts
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://127.0.0.1:5173/');
    await expect(page.getByTestId('kds-error')).toBeVisible({ timeout: 12_000 });
    await expect
      .poll(() => consoleErrors.some((text) => text.includes('[KDS] Error de conexión con el servidor:')))
      .toBe(true);
  });
});
