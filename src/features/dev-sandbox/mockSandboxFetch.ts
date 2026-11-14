import { ApiClient } from '../../shared/api/client.ts';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import type { TokenProvider } from '../../shared/types/auth.ts';
import { ItemStatus, OrderStatus, type OrderStatus as OrderStatusValue } from '../../shared/types/order.ts';

export type SandboxSimAction = 'kitchen_start' | 'kitchen_deliver' | 'kitchen_reject' | 'expire_ttl';

export interface PresetItemConfig {
  readonly id: string;
  readonly label: string;
  readonly activeBg?: string;
}

export interface SandboxStore {
  orders: Record<string, Order>;
}

const ORDER_ID_REGEX = /\/orders\/([^/?]+)/;
const REDO_ITEM_REGEX = /\/orders\/([^/]+)\/items\/([^/]+)\/redo/;
const READY_ITEM_REGEX = /\/orders\/([^/]+)\/items\/([^/]+)\/ready/;
const REJECT_ITEM_REGEX = /\/orders\/([^/]+)\/items\/([^/]+)\/kitchen-reject/;
export const DEFAULT_WAITER_ID = '00000000-0000-0000-0000-000000000001';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Mock WebSocket for visual preset simulation mode without a live backend. */
export class MockWebSocket {
  readyState = 1;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor() {
    setTimeout(() => {
      this.onopen?.(new Event('open'));
    }, 50);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send(_data?: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    // Mock WebSocket send no-op
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'Mock closed', wasClean: true }));
  }
}

export function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function buildInitialPresets(): Record<string, Order> {
  return {
    'ord-mesa-4': {
      id: 'ord-mesa-4',
      orderId: 'ord-mesa-4',
      publicId: 'ord-mesa-4',
      orderNumber: 4,
      tableNumber: 4,
      isTakeaway: false,
      status: OrderStatus.CREATED,
      version: 1,
      totalAmount: 350.0,
      diningSessionId: 'ses-mesa-4-active',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      items: [
        {
          id: 'item-1',
          itemId: 'item-1',
          dishId: 'dish-hamburguesa',
          name: 'Hamburguesa Clásica',
          quantity: 2,
          unitPrice: 150.0,
          status: ItemStatus.PENDING,
          station: 'parrilla',
          notes: 'Sin cebolla',
          modifiers: ['Carne término medio', 'Extra queso'],
          version: 1,
        },
        {
          id: 'item-2',
          itemId: 'item-2',
          dishId: 'dish-fries-1',
          name: 'Papas Francesas',
          quantity: 1,
          unitPrice: 50.0,
          status: ItemStatus.PENDING,
          station: 'freidora',
          notes: 'Crujientes',
          modifiers: [],
          version: 1,
        },
      ],
      createdAt: isoMinutesAgo(2),
    },
    'ord-rechazada-stock': {
      id: 'ord-rechazada-stock',
      orderId: 'ord-rechazada-stock',
      publicId: 'ord-rechazada-stock',
      orderNumber: 8,
      tableNumber: 8,
      isTakeaway: false,
      status: OrderStatus.REJECTED,
      version: 2,
      totalAmount: 480.0,
      diningSessionId: 'ses-mesa-8-stock',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      rejectionDetails: {
        source: 'inventory',
        reason: 'Stock insuficiente en cámara fría para preparar hamburguesas.',
        missingIngredients: ['pan_brioche', 'queso_cheddar'],
        rejectedItems: [
          {
            offerId: 'dish-burger-1',
            dishId: 'dish-burger-1',
            name: 'Hamburguesa Doble Queso',
            requestedQuantity: 3,
            availableQuantity: 1,
            reason: 'Stock insuficiente en almacén de materias primas',
          },
        ],
        reservedItems: [
          {
            offerId: 'dish-burger-1',
            dishId: 'dish-burger-1',
            name: 'Hamburguesa Doble Queso',
            reservedQuantity: 1,
          },
          {
            offerId: 'dish-soda-1',
            dishId: 'dish-soda-1',
            name: 'Refresco Cola',
            reservedQuantity: 3,
          },
        ],
      },
      items: [
        {
          id: 'item-10',
          itemId: 'item-10',
          dishId: 'dish-burger-1',
          name: 'Hamburguesa Doble Queso',
          quantity: 3,
          unitPrice: 160.0,
          status: ItemStatus.PENDING,
          station: 'parrilla',
          notes: 'Solo hay 1 pan disponible',
          modifiers: ['Extra tocino'],
          version: 1,
        },
      ],
      createdAt: isoMinutesAgo(5),
    },
    'ord-reservada-kds': {
      id: 'ord-reservada-kds',
      orderId: 'ord-reservada-kds',
      publicId: 'ord-reservada-kds',
      orderNumber: 12,
      tableNumber: 12,
      isTakeaway: false,
      status: OrderStatus.RESERVED,
      version: 2,
      totalAmount: 220.0,
      diningSessionId: 'ses-mesa-12',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      confirmedAt: isoMinutesAgo(3),
      stockReservedAt: isoMinutesAgo(2),
      items: [
        {
          id: 'item-20',
          itemId: 'item-20',
          dishId: 'dish-tacos',
          name: 'Orden de Tacos al Pastor',
          quantity: 2,
          unitPrice: 110.0,
          status: ItemStatus.PENDING,
          station: 'parrilla',
          notes: 'Con piña y salsa aparte',
          modifiers: ['Cilantro', 'Cebolla'],
          version: 2,
        },
      ],
      createdAt: isoMinutesAgo(3),
    },
    'ord-caducada-ttl': {
      id: 'ord-caducada-ttl',
      orderId: 'ord-caducada-ttl',
      publicId: 'ord-caducada-ttl',
      orderNumber: 11,
      tableNumber: 11,
      isTakeaway: false,
      status: OrderStatus.RESERVED,
      version: 2,
      totalAmount: 95.0,
      diningSessionId: 'ses-mesa-11',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      confirmedAt: isoMinutesAgo(18),
      stockReservedAt: isoMinutesAgo(18),
      items: [
        {
          id: 'item-110',
          itemId: 'item-110',
          dishId: 'dish-guacamole',
          name: 'Guacamole con Totopos',
          quantity: 1,
          unitPrice: 95.0,
          status: ItemStatus.PENDING,
          station: 'fria',
          notes: 'Reserva caducada (>15m) en ventana de gracia KDS',
          modifiers: ['Totopos extra'],
          version: 1,
        },
      ],
      createdAt: isoMinutesAgo(19),
    },
    'ord-en-preparacion': {
      id: 'ord-en-preparacion',
      orderId: 'ord-en-preparacion',
      publicId: 'ord-en-preparacion',
      orderNumber: 6,
      tableNumber: 6,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 3,
      totalAmount: 385.0,
      diningSessionId: 'ses-mesa-6',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      confirmedAt: isoMinutesAgo(7),
      stockReservedAt: isoMinutesAgo(7),
      inPreparationAt: isoMinutesAgo(4),
      items: [
        {
          id: 'item-60',
          itemId: 'item-60',
          dishId: 'dish-arrachera',
          name: 'Arrachera Norteña 300g',
          quantity: 1,
          unitPrice: 290.0,
          status: ItemStatus.PENDING,
          station: 'parrilla',
          notes: 'Sin sal extra',
          modifiers: ['Término medio'],
          version: 2,
        },
        {
          id: 'item-61',
          itemId: 'item-61',
          dishId: 'dish-guacamole',
          name: 'Guacamole con Totopos',
          quantity: 1,
          unitPrice: 95.0,
          status: ItemStatus.READY,
          station: 'fria',
          notes: '',
          modifiers: ['Poco picante'],
          version: 2,
        },
      ],
      createdAt: isoMinutesAgo(8),
    },
    'ord-entregada-rehacer': {
      id: 'ord-entregada-rehacer',
      orderId: 'ord-entregada-rehacer',
      publicId: 'ord-entregada-rehacer',
      orderNumber: 3,
      tableNumber: 3,
      isTakeaway: false,
      status: OrderStatus.DELIVERED,
      version: 3,
      totalAmount: 180.0,
      diningSessionId: 'ses-mesa-3',
      responsibleWaiterId: DEFAULT_WAITER_ID,
      confirmedAt: isoMinutesAgo(14),
      stockReservedAt: isoMinutesAgo(14),
      inPreparationAt: isoMinutesAgo(10),
      items: [
        {
          id: 'item-30',
          itemId: 'item-30',
          dishId: 'dish-pasta-1',
          name: 'Pasta Carbonara',
          quantity: 1,
          unitPrice: 180.0,
          status: ItemStatus.DELIVERED,
          station: 'fria',
          notes: 'Servida al comensal',
          modifiers: [],
          version: 3,
        },
      ],
      createdAt: isoMinutesAgo(15),
    },
  };
}

export const UI_PRESET_ITEMS: readonly PresetItemConfig[] = [
  { id: 'ord-mesa-4', label: 'Mesa 4 (Creada)', activeBg: 'bg-blue-500 text-white border-blue-400' },
  {
    id: 'ord-rechazada-stock',
    label: '⚠️ Rechazo Stock (Inventario)',
    activeBg: 'bg-red-600 text-white border-red-500',
  },
  { id: 'ord-reservada-kds', label: 'Mesa 12 (Reservada)', activeBg: 'bg-emerald-600 text-white border-emerald-500' },
  {
    id: 'ord-caducada-ttl',
    label: '⏱️ Mesa 11 (Caducada >15m)',
    activeBg: 'bg-amber-600 text-white border-amber-500',
  },
  {
    id: 'ord-en-preparacion',
    label: '🍳 Mesa 6 (En Prep)',
    activeBg: 'bg-orange-600 text-white border-orange-500',
  },
  { id: 'ord-entregada-rehacer', label: 'Mesa 3 (Rehacer)', activeBg: 'bg-purple-600 text-white border-purple-500' },
];

export const SEED_ORDER_ITEMS: readonly PresetItemConfig[] = [
  { id: '44444444-4444-4444-4444-444444444444', label: 'Seed Creada' },
  { id: '11111111-1111-1111-1111-111111111111', label: 'Seed Reservada' },
  { id: '22222222-2222-2222-2222-222222222222', label: 'Seed En Prep' },
  { id: '33333333-3333-3333-3333-333333333333', label: 'Seed Entregada (Rehacer Real)' },
  { id: '77777777-7777-7777-7777-777777777777', label: 'Seed Rechazada' },
  { id: '88888888-8888-8888-8888-888888888888', label: 'Seed Caducada (>15m)' },
];

export function extractRawUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

export function extractOrderIdFromUrl(url: string, fallbackOrderId: string): string {
  const match = ORDER_ID_REGEX.exec(url);
  return match ? decodeURIComponent(match[1]) : fallbackOrderId;
}

function getRequestBodyString(init?: RequestInit): string | null {
  return typeof init?.body === 'string' ? init.body : null;
}

function parseJsonRecord(body?: string | null): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function recalculateOrderTotal(items: readonly OrderItem[]): number {
  return items.reduce((sum, item) => {
    const price = typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice) || 0;
    return sum + price * item.quantity;
  }, 0);
}

function handleConfirmOrder(order: Order): Order {
  const nowIso = new Date().toISOString();
  return {
    ...order,
    status: OrderStatus.RESERVED,
    confirmedAt: order.confirmedAt ?? nowIso,
    stockReservedAt: nowIso,
    awaitingStockConfirmation: false,
    rejectionDetails: null,
    version: order.version + 1,
    updatedAt: nowIso,
  };
}

function handleCancelOrder(order: Order): Order {
  return {
    ...order,
    status: OrderStatus.CANCELLED,
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

function parseRedoNote(body?: string | null): string {
  const parsed = parseJsonRecord(body);
  if (typeof parsed?.note === 'string' && parsed.note.trim()) {
    return parsed.note;
  }
  return 'Platillo solicitado para rehacer';
}

function handleRedoItem(order: Order, targetItemId: string, body?: string | null): Order {
  const note = parseRedoNote(body);
  return {
    ...order,
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
    items: order.items.map((item) => {
      const match = (item.id ?? item.itemId) === targetItemId;
      return match
        ? { ...item, status: ItemStatus.PENDING, notes: note, version: (item.version ?? 1) + 1 }
        : item;
    }),
  };
}

function mapUpdatedItem(
  existing: OrderItem | undefined,
  raw: Record<string, unknown>,
  idx: number,
): OrderItem {
  const fallbackId = `item-sim-${Date.now()}-${idx}`;
  const rawId = typeof raw.id === 'string' ? raw.id : undefined;
  const resolvedId = rawId ?? existing?.id ?? existing?.itemId ?? fallbackId;
  const rawUnitPrice = typeof raw.unitPrice === 'number' ? raw.unitPrice : existing?.unitPrice ?? 100;
  const rawQty =
    typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : existing?.quantity ?? 1;

  return {
    ...existing,
    id: resolvedId,
    itemId: typeof raw.itemId === 'string' ? raw.itemId : resolvedId,
    dishId: typeof raw.dishId === 'string' ? raw.dishId : existing?.dishId,
    sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : existing?.sourceId,
    offerId: typeof raw.offerId === 'string' ? raw.offerId : existing?.offerId,
    name: typeof raw.name === 'string' ? raw.name : existing?.name ?? 'Platillo',
    quantity: rawQty,
    unitPrice: rawUnitPrice,
    status: existing?.status ?? ItemStatus.PENDING,
    station: existing?.station ?? 'parrilla',
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.map(String) : existing?.modifiers ?? [],
    notes: typeof raw.notes === 'string' ? raw.notes : existing?.notes ?? '',
    version: (existing?.version ?? 1) + 1,
  };
}

function handleUpdateItems(order: Order, body?: string | null): Order {
  const parsed = parseJsonRecord(body);
  const rawItems = Array.isArray(parsed?.items) ? (parsed.items as Array<Record<string, unknown>>) : null;
  const nextItems = rawItems
    ? rawItems.map((it, idx) => mapUpdatedItem(order.items[idx], it, idx))
    : order.items;
  const shouldReopen = order.status === OrderStatus.REJECTED || order.status === OrderStatus.EXPIRED;

  return {
    ...order,
    status: shouldReopen ? OrderStatus.CREATED : order.status,
    confirmedAt: shouldReopen ? null : order.confirmedAt,
    stockReservedAt: shouldReopen ? null : order.stockReservedAt,
    rejectionDetails: shouldReopen ? null : order.rejectionDetails,
    items: nextItems,
    totalAmount: recalculateOrderTotal(nextItems),
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function handleStartPreparation(order: Order): Order {
  const nowIso = new Date().toISOString();
  return {
    ...order,
    status: OrderStatus.IN_PREPARATION,
    inPreparationAt: order.inPreparationAt ?? nowIso,
    version: order.version + 1,
    updatedAt: nowIso,
  };
}

function handleMarkItemReady(order: Order, targetItemId: string): Order {
  const updatedItems = order.items.map((item) => {
    const match = (item.id ?? item.itemId) === targetItemId;
    return match ? { ...item, status: ItemStatus.READY, version: (item.version ?? 1) + 1 } : item;
  });
  const allReady = updatedItems.every(
    (item) => item.status === ItemStatus.READY || item.status === ItemStatus.DELIVERED,
  );
  const finalItems = allReady
    ? updatedItems.map((item) => ({ ...item, status: ItemStatus.DELIVERED }))
    : updatedItems;

  return {
    ...order,
    status: allReady ? OrderStatus.DELIVERED : order.status,
    items: finalItems,
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function handleMarkOrderReady(order: Order): Order {
  return {
    ...order,
    status: OrderStatus.DELIVERED,
    items: order.items.map((item) => ({
      ...item,
      status: ItemStatus.DELIVERED,
      version: (item.version ?? 1) + 1,
    })),
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function handleKitchenReject(
  order: Order,
  targetItemId?: string,
  body?: string | null,
): Order {
  const parsed = parseJsonRecord(body);
  const reason =
    typeof parsed?.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : 'Insumo físico insuficiente en cocina';
  const targetItem = order.items.find((it) => (it.id ?? it.itemId) === targetItemId) ?? order.items[0];

  return {
    ...order,
    status: OrderStatus.REJECTED,
    rejectionDetails: {
      source: 'kitchen',
      reason,
      rejectedItems: targetItem
        ? [
            {
              itemId: targetItem.id ?? targetItem.itemId,
              dishId: targetItem.dishId,
              name: targetItem.name,
              requestedQuantity: targetItem.quantity,
              availableQuantity: 0,
              reason,
            },
          ]
        : [],
      reservedItems: [],
    },
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

function handleVoidOrder(order: Order, targetStatus: OrderStatusValue): Order {
  return {
    ...order,
    status: targetStatus,
    version: order.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

function buildKdsQueueOrders(orders: Order[], url: string): Order[] {
  if (url.includes('view=delivered')) {
    return orders.filter((order) => order.status === OrderStatus.DELIVERED);
  }
  return orders.filter((order) => {
    const isRedo =
      order.status === OrderStatus.DELIVERED &&
      order.items.some((item) => item.status === ItemStatus.PENDING);
    return (
      order.status === OrderStatus.RESERVED ||
      order.status === OrderStatus.IN_PREPARATION ||
      order.status === OrderStatus.EXPIRED ||
      isRedo
    );
  });
}

function createNewSandboxOrder(store: SandboxStore, body: string | null): Order {
  const parsed = parseJsonRecord(body);
  const nextNumber = Object.keys(store.orders).length + 101;
  const newId = `ord-sim-${nextNumber}`;
  const isTakeaway = Boolean(parsed?.isTakeaway);
  const tableNumber = typeof parsed?.tableNumber === 'number' ? parsed.tableNumber : 1;
  const newOrder: Order = {
    id: newId,
    orderId: newId,
    publicId: newId,
    orderNumber: nextNumber,
    tableNumber: isTakeaway ? null : tableNumber,
    isTakeaway,
    status: OrderStatus.CREATED,
    version: 1,
    totalAmount: 0,
    diningSessionId:
      typeof parsed?.diningSessionId === 'string' ? parsed.diningSessionId : 'ses-sim-local',
    responsibleWaiterId: DEFAULT_WAITER_ID,
    items: [],
    createdAt: new Date().toISOString(),
  };
  store.orders[newId] = newOrder;
  return newOrder;
}

function applyOrderMutation(
  url: string,
  method: string,
  currentOrder: Order,
  body: string | null,
): Order | null {
  const isPostOrPatch = method === 'POST' || method === 'PATCH';
  if (isPostOrPatch && url.endsWith('/confirm')) {
    return handleConfirmOrder(currentOrder);
  }
  if (method === 'PATCH' && url.endsWith('/cancel')) {
    return handleCancelOrder(currentOrder);
  }
  if (isPostOrPatch && url.endsWith('/start-preparation')) {
    return handleStartPreparation(currentOrder);
  }
  if (isPostOrPatch && url.endsWith('/ready')) {
    const itemReadyMatch = READY_ITEM_REGEX.exec(url);
    return itemReadyMatch
      ? handleMarkItemReady(currentOrder, decodeURIComponent(itemReadyMatch[2]))
      : handleMarkOrderReady(currentOrder);
  }
  if (isPostOrPatch && url.endsWith('/kitchen-reject')) {
    const itemRejectMatch = REJECT_ITEM_REGEX.exec(url);
    const targetItemId = itemRejectMatch ? decodeURIComponent(itemRejectMatch[2]) : undefined;
    return handleKitchenReject(currentOrder, targetItemId, body);
  }
  if (isPostOrPatch && url.endsWith('/void-kitchen-error')) {
    return handleVoidOrder(currentOrder, OrderStatus.WASTED);
  }
  if (isPostOrPatch && url.endsWith('/void')) {
    return handleVoidOrder(currentOrder, OrderStatus.VOIDED);
  }
  if (method === 'PATCH') {
    const redoMatch = REDO_ITEM_REGEX.exec(url);
    if (redoMatch) {
      return handleRedoItem(currentOrder, decodeURIComponent(redoMatch[2]), body);
    }
    if (url.endsWith('/items')) {
      return handleUpdateItems(currentOrder, body);
    }
  }
  return null;
}

/**
 * In-memory fetch handler backing both OrderTicketWidget and KdsApp in sandbox simulation mode.
 */
export function executeMockFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  store: SandboxStore,
  selectedOrderId: string,
): Response {
  const url = extractRawUrl(input).replace(/^https?:\/\/[^/]+/, '');
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method === 'GET' && url.includes('/kds/queue')) {
    return jsonResponse(buildKdsQueueOrders(Object.values(store.orders), url), 200);
  }

  if (method === 'POST' && /^\/(?:api\/v1\/(?:orders|kitchen)\/)?orders\/?$/.test(url)) {
    const created = createNewSandboxOrder(store, getRequestBodyString(init));
    return jsonResponse(created, 201);
  }

  const targetOrderId = extractOrderIdFromUrl(url, selectedOrderId);
  const currentOrder = store.orders[targetOrderId];

  if (!currentOrder) {
    return jsonResponse({ code: 'NOT_FOUND', message: 'Order not found' }, 404);
  }

  if (method === 'GET') {
    return jsonResponse(currentOrder, 200);
  }

  const updated = applyOrderMutation(url, method, currentOrder, getRequestBodyString(init));
  if (updated) {
    store.orders[targetOrderId] = updated;
    return jsonResponse(updated, 200);
  }

  return jsonResponse(currentOrder, 200);
}

export interface SandboxController {
  readonly mockFetch: typeof fetch;
  readonly mockKdsClient: ApiClient;
  readonly updateContext: (
    selectedOrderId: string,
    tokenProvider: TokenProvider,
    onMutated: (orderId: string) => void,
  ) => void;
  readonly getOrder: (orderId: string) => Order | undefined;
  readonly getOrders: () => Order[];
  readonly resetPreset: (orderId: string) => Order | undefined;
  readonly simulateAction: (orderId: string, action: SandboxSimAction) => Order | undefined;
}

/**
 * Creates a self-contained in-memory Waiter <-> KDS sandbox controller with a shared order store.
 */
export function createSandboxController(initialTokenProvider: TokenProvider): SandboxController {
  const store: SandboxStore = { orders: buildInitialPresets() };
  let activeOrderId = 'ord-mesa-4';
  let activeTokenProvider = initialTokenProvider;
  let activeOnMutated: (orderId: string) => void = () => {};

  const mockFetch: typeof fetch = (input, init) => {
    const res = executeMockFetch(input, init, store, activeOrderId);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      const targetId = extractOrderIdFromUrl(extractRawUrl(input), activeOrderId);
      setTimeout(() => activeOnMutated(targetId), 0);
    }
    return Promise.resolve(res);
  };

  const mockKdsClient = new ApiClient({
    baseUrl: '',
    tokenProvider: () => activeTokenProvider(),
    fetchFn: mockFetch,
  });

  return {
    mockFetch,
    mockKdsClient,
    updateContext: (selectedOrderId, tokenProvider, onMutated) => {
      activeOrderId = selectedOrderId;
      activeTokenProvider = tokenProvider;
      activeOnMutated = onMutated;
    },
    getOrder: (orderId) => store.orders[orderId],
    getOrders: () => Object.values(store.orders),
    resetPreset: (orderId) => {
      const freshOrder = buildInitialPresets()[orderId];
      if (freshOrder) {
        store.orders[orderId] = freshOrder;
      }
      return freshOrder;
    },
    simulateAction: (orderId, action) => {
      const current = store.orders[orderId];
      if (!current) return undefined;
      let updated: Order = current;
      if (action === 'kitchen_start') {
        updated = handleStartPreparation(current);
      } else if (action === 'kitchen_deliver') {
        updated = handleMarkOrderReady(current);
      } else if (action === 'kitchen_reject') {
        updated = handleKitchenReject(current);
      } else if (action === 'expire_ttl') {
        const expiredIso = isoMinutesAgo(18);
        updated = {
          ...current,
          status: OrderStatus.RESERVED,
          confirmedAt: expiredIso,
          stockReservedAt: expiredIso,
          version: current.version + 1,
        };
      }
      store.orders[orderId] = updated;
      return updated;
    },
  };
}
