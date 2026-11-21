import type { Page, Route } from '@playwright/test';

export type MockOrderStatus =
  | 'CREATED'
  | 'RESERVED'
  | 'IN_PREPARATION'
  | 'DELIVERED'
  | 'PAID'
  | 'CANCELLED'
  | 'REJECTED'
  | 'WASTED'
  | 'VOIDED'
  | 'EXPIRED';

export interface MockOrderItem {
  id: string;
  itemId: string;
  dishId?: string;
  sourceId?: string;
  offerId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  status: 'PENDING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  station?: string;
  modifiers?: string[];
  notes?: string | null;
  preparationTimeText?: string | null;
}

export interface MockOrder {
  id: string;
  publicId: string;
  orderNumber: number;
  tableNumber: number | null;
  isTakeaway: boolean;
  status: MockOrderStatus;
  version: number;
  diningSessionId?: string | null;
  responsibleWaiterId?: string | null;
  confirmedAt?: string | null;
  stockReservedAt?: string | null;
  stock_reserved_at?: string | null;
  inPreparationAt?: string | null;
  rejectionDetails?: Record<string, unknown> | null;
  awaitingStockConfirmation?: boolean;
  items: MockOrderItem[];
}

export function makeItem(overrides: Partial<MockOrderItem> = {}): MockOrderItem {
  const id = overrides.id ?? 'item-1';
  return {
    id,
    itemId: overrides.itemId ?? id,
    dishId: overrides.dishId ?? 'dish-tacos',
    sourceId: overrides.sourceId ?? 'src-tacos',
    offerId: overrides.offerId ?? 'offer-tacos',
    name: overrides.name ?? 'Tacos al Pastor',
    quantity: overrides.quantity ?? 2,
    unitPrice: overrides.unitPrice ?? 120,
    status: overrides.status ?? 'PENDING',
    station: overrides.station ?? 'parrilla',
    modifiers: overrides.modifiers ?? ['Sin cebolla'],
    notes: overrides.notes ?? 'Bien dorados',
    preparationTimeText: overrides.preparationTimeText ?? '10 min',
  };
}

export function makeOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  const id = overrides.id ?? 'ord-e2e-1';
  return {
    id,
    publicId: overrides.publicId ?? id,
    orderNumber: overrides.orderNumber ?? 101,
    tableNumber: overrides.tableNumber === undefined ? 4 : overrides.tableNumber,
    isTakeaway: overrides.isTakeaway ?? false,
    status: overrides.status ?? 'CREATED',
    version: overrides.version ?? 1,
    diningSessionId: overrides.diningSessionId ?? null,
    responsibleWaiterId: overrides.responsibleWaiterId ?? '00000000-0000-0000-0000-000000000001',
    confirmedAt: overrides.confirmedAt ?? null,
    stockReservedAt: overrides.stockReservedAt ?? null,
    stock_reserved_at: overrides.stock_reserved_at ?? overrides.stockReservedAt ?? null,
    inPreparationAt: overrides.inPreparationAt ?? null,
    rejectionDetails: overrides.rejectionDetails ?? null,
    awaitingStockConfirmation: overrides.awaitingStockConfirmation ?? false,
    items: overrides.items ?? [makeItem()],
  };
}

export function makeRejectedOrder(id = 'ord-rejected-1'): MockOrder {
  return makeOrder({
    id,
    orderNumber: 109,
    status: 'REJECTED',
    rejectionDetails: {
      reason: 'Inventario insuficiente para preparar la orden',
      missingIngredients: ['aguacate', 'tortilla_maiz'],
      rejectedItems: [
        {
          dishId: 'dish-guacamole',
          offerId: 'offer-guacamole',
          name: 'Guacamole Especial',
          requestedQuantity: 3,
          availableQuantity: 1,
          reason: 'stock insuficiente en cocina',
        },
      ],
      reservedItems: [
        {
          dishId: 'dish-tacos',
          name: 'Tacos al Pastor',
          reservedQuantity: 2,
        },
      ],
    },
    items: [
      makeItem({
        id: 'item-rej-1',
        dishId: 'dish-guacamole',
        name: 'Guacamole Especial',
        quantity: 3,
      }),
      makeItem({ id: 'item-rej-2', name: 'Tacos al Pastor', quantity: 2 }),
    ],
  });
}

export interface RecordedApiCall {
  method: string;
  pathname: string;
  body: unknown;
}

export function makeDefaultOpenShiftResponse() {
  return {
    isOpen: true,
    canAcceptOrders: true,
    currentShift: {
      id: 'shift-e2e-1',
      shiftId: 'shift-e2e-1',
      shiftNumber: 1,
      status: 'OPEN',
      lastOrderFolio: 1,
      openedAt: '2026-11-14T08:00:00Z',
      version: 1,
    },
    lastClosedShift: null,
    nextShiftNumber: 2,
  };
}

function normalizeApiPath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/(?:orders|kitchen)(?=\/)/, '');
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Installs deterministic REST + WebSocket mocks matching `orders-frontend` Zod schemas.
 * Stores mutated orders in memory across GET/POST/PATCH requests so tests stay stateful without flakiness.
 */
export async function mockOrdersAndKdsRoutes(
  page: Page,
  initialOrders: MockOrder[] = [],
): Promise<{
  orders: Map<string, MockOrder>;
  calls: RecordedApiCall[];
}> {
  const orders = new Map(initialOrders.map((ord) => [ord.id, structuredClone(ord)]));
  const calls: RecordedApiCall[] = [];
  let createdSeq = 200;

  await page.routeWebSocket(/\/ws\/(waiter|kds)/, (ws) => {
    ws.onMessage(() => {
      // Keep mock socket open silently without triggering reconnect noise
    });
  });

  // Register broad /orders route BEFORE specific routes (/shifts/current, /kds/queue)
  // because Playwright matches routes in reverse registration order (LIFO),
  // and API gateway URLs contain `/api/v1/orders/...`.
  await page.route('**/orders**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const normalizedPath = normalizeApiPath(url.pathname);

    if (!normalizedPath.startsWith('/orders')) {
      return route.fallback();
    }

    let parsedBody: unknown;
    try {
      parsedBody = req.postDataJSON();
    } catch {
      parsedBody = req.postData();
    }
    calls.push({ method, pathname: normalizedPath, body: parsedBody });

    // GET /orders (shift list or filtered by diningSessionId)
    if (method === 'GET' && /^\/orders\/?$/.test(normalizedPath)) {
      return fulfillJson(route, Array.from(orders.values()));
    }

    // POST /orders (create blank order)
    if (method === 'POST' && /^\/orders\/?$/.test(normalizedPath)) {
      createdSeq += 1;
      const body = (parsedBody ?? {}) as {
        tableNumber?: number | null;
        isTakeaway?: boolean;
        diningSessionId?: string;
      };
      const newOrd = makeOrder({
        id: `ord-created-${createdSeq}`,
        orderNumber: createdSeq,
        tableNumber: body.isTakeaway ? null : (body.tableNumber ?? 1),
        isTakeaway: Boolean(body.isTakeaway),
        diningSessionId: body.diningSessionId ?? null,
        status: 'CREATED',
        items: [],
      });
      orders.set(newOrd.id, newOrd);
      return fulfillJson(route, newOrd, 201);
    }

    // Extract orderId from /orders/:id[/action]
    const match = /^\/orders\/([^/]+)(?:\/(.+))?$/.exec(normalizedPath);
    if (!match) {
      return fulfillJson(route, { error: { code: 'NOT_FOUND', message: 'Route not mocked' } }, 404);
    }
    const orderId = decodeURIComponent(match[1]);
    const subPath = match[2] ?? '';
    const existing = orders.get(orderId);

    if (!existing) {
      return fulfillJson(route, { error: { code: 'ORDER_NOT_FOUND', message: 'Not found' } }, 404);
    }

    if (method === 'GET' && !subPath) {
      return fulfillJson(route, existing);
    }

    if (method === 'PATCH' && subPath === 'items') {
      const body = (parsedBody ?? {}) as { items?: Partial<MockOrderItem>[] };
      existing.items = (body.items ?? []).map((it, idx) =>
        makeItem({
          ...it,
          id: it.id ?? `item-${orderId}-${idx + 1}`,
          itemId: it.itemId ?? it.id ?? `item-${orderId}-${idx + 1}`,
          unitPrice: typeof it.unitPrice === 'number' ? it.unitPrice : 100,
          status: 'PENDING',
        }),
      );
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if (method === 'POST' && subPath === 'confirm') {
      existing.status = 'RESERVED';
      existing.confirmedAt = new Date().toISOString();
      existing.stockReservedAt = existing.confirmedAt;
      existing.stock_reserved_at = existing.confirmedAt;
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if ((method === 'PATCH' || method === 'POST') && subPath === 'cancel') {
      existing.status = 'CANCELLED';
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if ((method === 'PATCH' || method === 'POST') && subPath === 'start-preparation') {
      existing.status = 'IN_PREPARATION';
      existing.inPreparationAt = new Date().toISOString();
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if ((method === 'PATCH' || method === 'POST') && subPath === 'ready') {
      existing.status = 'DELIVERED';
      existing.items = existing.items.map((it) => ({ ...it, status: 'DELIVERED' }));
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if (
      (method === 'PATCH' || method === 'POST') &&
      (subPath === 'void' || subPath === 'void-charge' || subPath === 'void-kitchen-error')
    ) {
      existing.status = 'VOIDED';
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    if (
      (method === 'PATCH' || method === 'POST') &&
      (subPath === 'kitchen-reject' || /^items\/[^/]+\/kitchen-reject$/.test(subPath))
    ) {
      existing.status = 'REJECTED';
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    const itemReadyMatch = /^items\/([^/]+)\/ready$/.exec(subPath);
    if ((method === 'PATCH' || method === 'POST') && itemReadyMatch) {
      const targetItemId = decodeURIComponent(itemReadyMatch[1]);
      existing.items = existing.items.map((it) =>
        it.id === targetItemId || it.itemId === targetItemId ? { ...it, status: 'READY' } : it,
      );
      existing.version += 1;
      return fulfillJson(route, existing);
    }

    return fulfillJson(route, existing);
  });

  await page.route('**/shifts/current*', async (route) => {
    await fulfillJson(route, makeDefaultOpenShiftResponse());
  });

  await page.route('**/kds/queue*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const normalizedPath = normalizeApiPath(url.pathname);
    calls.push({ method: req.method(), pathname: `${normalizedPath}${url.search}`, body: null });
    const view = url.searchParams.get('view') ?? 'active';
    const list = Array.from(orders.values()).filter((ord) =>
      view === 'delivered'
        ? ord.status === 'DELIVERED'
        : ord.status !== 'DELIVERED' || ord.items.some((item) => item.status === 'PENDING'),
    );
    await fulfillJson(route, list);
  });

  return { orders, calls };
}
