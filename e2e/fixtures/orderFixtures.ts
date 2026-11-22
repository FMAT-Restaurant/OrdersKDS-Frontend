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
  const { tableNumber = 4 } = overrides;
  return {
    id,
    publicId: overrides.publicId ?? id,
    orderNumber: overrides.orderNumber ?? 101,
    tableNumber,
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

function parseRouteBody(route: Route): unknown {
  const req = route.request();
  try {
    return req.postDataJSON();
  } catch {
    return req.postData();
  }
}

function buildCreatedOrder(createdSeq: number, parsedBody: unknown): MockOrder {
  const body = (parsedBody ?? {}) as {
    tableNumber?: number | null;
    isTakeaway?: boolean;
    diningSessionId?: string;
  };
  return makeOrder({
    id: `ord-created-${createdSeq}`,
    orderNumber: createdSeq,
    tableNumber: body.isTakeaway ? null : (body.tableNumber ?? 1),
    isTakeaway: Boolean(body.isTakeaway),
    diningSessionId: body.diningSessionId ?? null,
    status: 'CREATED',
    items: [],
  });
}

function resolveVoidStatus(subPath: string, parsedBody: unknown): MockOrderStatus {
  if (subPath === 'void-charge') {
    return 'WASTED';
  }
  if (subPath === 'void-kitchen-error') {
    return 'VOIDED';
  }
  const body = (parsedBody ?? {}) as { chargeCustomer?: boolean };
  return body.chargeCustomer ? 'WASTED' : 'VOIDED';
}

function applyItemsPatch(existing: MockOrder, orderId: string, parsedBody: unknown): void {
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
}

function applyItemReady(existing: MockOrder, targetItemId: string): void {
  existing.items = existing.items.map((it) =>
    it.id === targetItemId || it.itemId === targetItemId ? { ...it, status: 'READY' } : it,
  );
  existing.version += 1;
}

function applyStatusTransition(
  existing: MockOrder,
  method: string,
  subPath: string,
  parsedBody: unknown,
): boolean {
  if (subPath === 'confirm' && method === 'POST') {
    const nowIso = new Date().toISOString();
    existing.status = 'RESERVED';
    existing.confirmedAt = nowIso;
    existing.stockReservedAt = nowIso;
    existing.stock_reserved_at = nowIso;
    existing.version += 1;
    return true;
  }

  switch (subPath) {
    case 'cancel':
      existing.status = 'CANCELLED';
      existing.version += 1;
      return true;
    case 'start-preparation':
      existing.status = 'IN_PREPARATION';
      existing.inPreparationAt = new Date().toISOString();
      existing.version += 1;
      return true;
    case 'ready':
      existing.status = 'DELIVERED';
      existing.items = existing.items.map((it) => ({ ...it, status: 'DELIVERED' }));
      existing.version += 1;
      return true;
    case 'void':
    case 'void-charge':
    case 'void-kitchen-error':
      existing.status = resolveVoidStatus(subPath, parsedBody);
      existing.version += 1;
      return true;
    default:
      return false;
  }
}

function mutateOrderAction(
  existing: MockOrder,
  method: string,
  subPath: string,
  parsedBody: unknown,
): void {
  if (applyStatusTransition(existing, method, subPath, parsedBody)) {
    return;
  }
  if (subPath === 'kitchen-reject' || /^items\/[^/]+\/kitchen-reject$/.test(subPath)) {
    existing.status = 'REJECTED';
    existing.version += 1;
    return;
  }
  const itemReadyMatch = /^items\/([^/]+)\/ready$/.exec(subPath);
  if (itemReadyMatch) {
    applyItemReady(existing, decodeURIComponent(itemReadyMatch[1]));
  }
}

function handleSingleOrderRoute(
  route: Route,
  orders: Map<string, MockOrder>,
  method: string,
  normalizedPath: string,
  parsedBody: unknown,
): Promise<void> {
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
    applyItemsPatch(existing, orderId, parsedBody);
    return fulfillJson(route, existing);
  }
  if (method === 'PATCH' || method === 'POST') {
    mutateOrderAction(existing, method, subPath, parsedBody);
  }
  return fulfillJson(route, existing);
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
    const normalizedPath = normalizeApiPath(new URL(req.url()).pathname);

    if (!normalizedPath.startsWith('/orders')) {
      return route.fallback();
    }

    const parsedBody = parseRouteBody(route);
    calls.push({ method, pathname: normalizedPath, body: parsedBody });

    if (method === 'GET' && /^\/orders\/?$/.test(normalizedPath)) {
      return fulfillJson(route, Array.from(orders.values()));
    }

    if (method === 'POST' && /^\/orders\/?$/.test(normalizedPath)) {
      createdSeq += 1;
      const newOrd = buildCreatedOrder(createdSeq, parsedBody);
      orders.set(newOrd.id, newOrd);
      return fulfillJson(route, newOrd, 201);
    }

    return handleSingleOrderRoute(route, orders, method, normalizedPath, parsedBody);
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
