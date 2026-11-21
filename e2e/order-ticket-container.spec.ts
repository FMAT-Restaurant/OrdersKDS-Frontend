import { expect, test } from '@playwright/test';
import { seedAuthSession } from './fixtures/authSession.ts';
import {
  assertMinTouchBox,
  assertNoHorizontalOverflow,
  dispatchMenuAddItem,
  setTicketContainerWidth,
} from './fixtures/containerHarness.ts';
import { makeItem, makeOrder, mockOrdersAndKdsRoutes } from './fixtures/orderFixtures.ts';

test.describe('ST-18 — OrderTicketWidget container queries, contratos DOM y reglas POS', () => {
  test('adapta layout y padding sin overflow horizontal en 320px, 360px, 480px y 800px', async ({
    page,
  }) => {
    await seedAuthSession(page, { role: 'waiter' });
    await mockOrdersAndKdsRoutes(page, []);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nueva Orden' })).toBeVisible();

    await dispatchMenuAddItem(page, 'fmat:orden:add-item', {
      dishId: 'dish-env-1',
      sourceId: 'src-env-1',
      offerId: 'offer-env-1',
      name: 'Cochinita Pibil',
      unitPrice: 145,
      quantity: 1,
    });

    const ticket = page.locator('.orders-kds-root .order-ticket');
    const itemEditor = page.locator('.orders-kds-root .order-ticket__item-editor').first();
    await expect(itemEditor).toBeVisible();

    for (const width of [320, 360, 480] as const) {
      await page.setViewportSize({ width: Math.max(width, 360), height: 800 });
      await setTicketContainerWidth(page, width);

      await assertNoHorizontalOverflow(ticket, `OrderTicket @${width}px`);

      // Por debajo de @container order-ticket (min-width: 38rem = 608px) es 1 columna
      const colsNarrow = await itemEditor.evaluate(
        (el) => window.getComputedStyle(el).gridTemplateColumns.split(' ').length,
      );
      expect(colsNarrow).toBe(1);
    }

    // En 800px (>= 38rem = 608px) se activa el @container query: 2 columnas y padding 1.5rem (24px)
    await page.setViewportSize({ width: 1024, height: 800 });
    await setTicketContainerWidth(page, 800);
    await expect
      .poll(async () =>
        itemEditor.evaluate((el) => ({
          cols: window.getComputedStyle(el).gridTemplateColumns.split(' ').length,
          padding: window.getComputedStyle(el.closest('.order-ticket')!).paddingTop,
        })),
      )
      .toEqual({ cols: 2, padding: '24px' });

    await assertNoHorizontalOverflow(ticket, 'OrderTicket @800px');
  });

  test('garantiza objetivos tactiles >= 48px en contenedor handheld portrait 360px', async ({
    page,
  }) => {
    const createdOrder = makeOrder({
      id: 'ord-pos-1',
      orderNumber: 301,
      status: 'CREATED',
      items: [makeItem({ id: 'it-1', name: 'Panuchos' })],
    });
    const deliveredOrder = makeOrder({
      id: 'ord-pos-delivered',
      orderNumber: 302,
      status: 'DELIVERED',
      items: [makeItem({ id: 'it-del-1', name: 'Sopa de Lima', status: 'DELIVERED' })],
    });

    await seedAuthSession(page, { role: 'waiter' });
    await mockOrdersAndKdsRoutes(page, [createdOrder, deliveredOrder]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await setTicketContainerWidth(page, 360);

    // Seleccionar orden CREATED para verificar Confirmar / Cancelar / Modificar
    await page.getByTestId('table-order-chip-ord-pos-1').click();
    await assertMinTouchBox(page.getByRole('button', { name: 'Confirmar' }), 48);
    await assertMinTouchBox(page.getByRole('button', { name: 'Modificar' }), 48);
    await assertMinTouchBox(page.getByRole('button', { name: 'Cancelar' }), 48);

    // En modo edición, botón "Quitar platillo" cumple mínimo >= 44px (2.75rem)
    await page.getByRole('button', { name: 'Modificar' }).click();
    await assertMinTouchBox(page.getByRole('button', { name: 'Quitar platillo' }), 44);
    await page.getByRole('button', { name: 'Descartar' }).click();

    // Seleccionar orden DELIVERED para verificar botón "Rehacer"
    await page.getByTestId('table-order-chip-ord-pos-delivered').click();
    await assertMinTouchBox(page.getByRole('button', { name: /Rehacer Sopa de Lima/i }), 48);
  });

  test('acepta eventos DOM bilingües fmat:orden:add-item y fmat:comanda:add-item con offerId, sourceId y unitPrice', async ({
    page,
  }) => {
    await seedAuthSession(page, { role: 'waiter' });
    const { calls } = await mockOrdersAndKdsRoutes(page, []);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nueva Orden' })).toBeVisible();

    await dispatchMenuAddItem(page, 'fmat:orden:add-item', {
      dishId: 'dish-a',
      sourceId: 'src-a',
      offerId: 'offer-promo-1',
      name: 'Enchiladas Suizas',
      unitPrice: 135,
      quantity: 1,
    });
    await dispatchMenuAddItem(page, 'fmat:comanda:add-item', {
      dishId: 'dish-b',
      sourceId: 'src-b',
      offerId: 'offer-promo-2',
      name: 'Agua de Jamaica',
      unitPrice: 45,
      quantity: 2,
    });

    await expect(page.getByText('Enchiladas Suizas', { exact: true })).toBeVisible();
    await expect(page.getByText('Agua de Jamaica', { exact: true })).toBeVisible();

    await page.getByTestId('order-ticket-create-draft-btn').click();

    await expect
      .poll(() => calls.find((c) => c.method === 'PATCH' && c.pathname.endsWith('/items'))?.body)
      .toEqual({
        items: [
          expect.objectContaining({
            sourceId: 'src-a',
            offerId: 'offer-promo-1',
            unitPrice: 135,
            name: 'Enchiladas Suizas',
            quantity: 1,
          }),
          expect.objectContaining({
            sourceId: 'src-b',
            offerId: 'offer-promo-2',
            unitPrice: 45,
            name: 'Agua de Jamaica',
            quantity: 2,
          }),
        ],
      });
  });

  test('permite editar mesa si no hay órdenes previas y destaca botón verde Agregar Orden', async ({
    page,
  }) => {
    await seedAuthSession(page, { role: 'waiter' });
    await mockOrdersAndKdsRoutes(page, []);
    await page.goto('/');

    // Sin órdenes previas en sesión: input de mesa editable
    const tableInput = page.getByTestId('draft-table-input');
    await expect(tableInput).toBeEnabled();
    await tableInput.fill('7');
    await expect(tableInput).toHaveValue('7');

    // Crear orden para mesa 7 -> aparece panel de órdenes por mesa con botón verde Agregar Orden
    await dispatchMenuAddItem(page, 'fmat:orden:add-item', {
      sourceId: 'src-chilaquiles',
      offerId: 'off-chilaquiles',
      name: 'Chilaquiles Verdes',
      unitPrice: 110,
    });
    await page.getByTestId('order-ticket-create-draft-btn').click();

    await page.getByTestId('toggle-table-orders-panel-btn').click();
    const addOrderBtn = page.getByTestId('new-order-for-table:7');
    await expect(addOrderBtn).toHaveText('Agregar Orden');

    // Color verde oficial #15803d = rgb(21, 128, 61) definido en OrderTicketWidget.css
    const bg = await addOrderBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(21, 128, 61)');

    // Al crear segunda orden para mesa 7, mesa queda bloqueada pero permite desbloquear con "Otra mesa"
    await addOrderBtn.click();
    await expect(page.getByTestId('draft-table-input')).toBeDisabled();
    await page.getByTestId('draft-unlock-table-btn').click();
    await expect(page.getByTestId('draft-table-input')).toBeEnabled();
  });

  test('bloquea edición en RESERVED y permite vaciar a 0 ítems en EXPIRED y reiniciar con Crear una nueva orden', async ({
    page,
  }) => {
    const reservedOrd = makeOrder({
      id: 'ord-res-imm',
      orderNumber: 401,
      status: 'RESERVED',
      items: [makeItem({ id: 'it-r1', name: 'Salbutes' })],
    });
    const expiredOrd = makeOrder({
      id: 'ord-exp-reset',
      orderNumber: 402,
      status: 'EXPIRED',
      items: [makeItem({ id: 'it-e1', name: 'Papadzules' })],
    });

    await seedAuthSession(page, { role: 'waiter' });
    await mockOrdersAndKdsRoutes(page, [reservedOrd, expiredOrd]);
    await page.goto('/');

    // Inmutabilidad en RESERVED
    await page.getByTestId('table-order-chip-ord-res-imm').click();
    await expect(page.getByRole('button', { name: 'Modificar' })).toBeDisabled();

    // Tras expiración (EXPIRED), Modificar se habilita y permite vaciar hasta 0 ítems sin crash
    await page.getByTestId('table-order-chip-ord-exp-reset').click();
    const modifyBtn = page.getByRole('button', { name: 'Modificar' });
    await expect(modifyBtn).toBeEnabled();
    await modifyBtn.click();

    await page.getByRole('button', { name: 'Quitar platillo' }).click();
    await expect(page.getByText('Esta orden todavía no tiene platillos.')).toBeVisible();

    await page.getByRole('button', { name: 'Descartar' }).click();
    await page.getByRole('button', { name: 'Crear una nueva orden' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva Orden' })).toBeVisible();
  });
});
