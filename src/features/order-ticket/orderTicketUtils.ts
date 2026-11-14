/**
 * @file Pure helpers, state derivation, and label mappings for OrderTicketWidget.
 * @satisfies RF-12, RF-13, RF-14, RF-17, RF-22, RF-23
 */

import { ApiError } from '../../shared/api/client.ts';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import { getErrorMessage } from '../../shared/i18n/translate.ts';
import { type OrderStatusChangedEvent, WebSocketStatus } from '../../shared/realtime/types.ts';
import {
  ItemStatus,
  OrderStatus,
  type OrderStatus as OrderStatusValue,
} from '../../shared/types/order.ts';
import type { EditableOrderItem } from './draftItemsHelper.ts';

/** Normalized structure for an item rejected during inventory reservation. */
export interface RejectedItemDetail {
  readonly offerId?: string;
  readonly dishId?: string;
  readonly itemId?: string;
  readonly name?: string;
  readonly itemName?: string;
  readonly reason?: string;
  readonly requestedQuantity?: number | null;
  readonly availableQuantity?: number;
  readonly availableStock?: number;
}

/** Normalized structure for an item temporarily pre-reserved in inventory. */
export interface ReservedItemDetail {
  readonly offerId?: string;
  readonly dishId?: string;
  readonly name?: string;
  readonly quantity?: number;
  readonly reservedQuantity?: number;
}

/** Parsed inventory rejection breakdown extracted from heterogeneous broker/backend shapes. */
export interface ParsedRejectionDetails {
  readonly source?: string;
  readonly reason?: string;
  readonly missingIngredients?: string[];
  readonly rejectedItems: readonly RejectedItemDetail[];
  readonly reservedItems: readonly ReservedItemDetail[];
}

/** Outbound item shape serialized for `PATCH /orders/{id}/items`. */
export interface OrderItemApiInput {
  readonly id?: string;
  readonly itemId?: string;
  readonly dishId?: string;
  readonly sourceId?: string;
  readonly offerId?: string;
  readonly unitPrice?: number;
  readonly name: string;
  readonly quantity: number;
  readonly modifiers: string[];
  readonly notes: string;
}

/** Source shape accepted when constructing an editable draft order item. */
export interface EditableItemSource {
  readonly dishId?: string;
  readonly sourceId?: string;
  readonly offerId?: string;
  readonly itemId?: string;
  readonly unitPrice?: number;
  readonly name: string;
  readonly quantity?: number;
  readonly modifiers?: readonly string[];
  readonly notes?: string;
}

/** Action permission flags derived from current order status. */
export interface OrderActionPermissions {
  readonly isRejected: boolean;
  readonly canCancel: boolean;
  readonly canEdit: boolean;
  readonly canConfirm: boolean;
  readonly canRequestBill: boolean;
  readonly canResetToNew: boolean;
  readonly showTerminalResetButton: boolean;
}

/** Active waiter orders grouped by assigned table or takeaway channel. */
export interface TableOrderGroup {
  readonly groupKey: string;
  readonly label: string;
  readonly tableNumber: number | null;
  readonly isTakeaway: boolean;
  readonly orders: readonly Order[];
}

/** React Query key prefix for individual order ticket queries. */
export const ORDER_QUERY_PREFIX = ['order'] as const;

/** Spanish user-facing status badges mapped from domain OrderStatus values. */
export const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  [OrderStatus.CREATED]: 'Creada',
  [OrderStatus.RESERVED]: 'Reservado en cocina',
  [OrderStatus.IN_PREPARATION]: 'En preparación',
  [OrderStatus.DELIVERED]: 'Entregada por cocina',
  [OrderStatus.PAID]: 'Pagada',
  [OrderStatus.CANCELLED]: 'Cancelada',
  [OrderStatus.REJECTED]: 'Rechazada',
  [OrderStatus.WASTED]: 'Merma',
  [OrderStatus.VOIDED]: 'Anulada',
  [OrderStatus.EXPIRED]: 'Expirada',
};

/** Spanish user-facing item status labels. */
export const ITEM_STATUS_LABELS: Record<
  (typeof ItemStatus)[keyof typeof ItemStatus],
  string
> = {
  [ItemStatus.PENDING]: 'Pendiente',
  [ItemStatus.READY]: 'Listo',
  [ItemStatus.DELIVERED]: 'Entregado',
  [ItemStatus.CANCELLED]: 'Cancelado',
};

/** Maps internal WebSocket client status enums to translation keys. */
export const WEBSOCKET_STATUS_TRANSLATIONS: Record<
  (typeof WebSocketStatus)[keyof typeof WebSocketStatus],
  'connected' | 'connecting' | 'disconnected' | 'reconnecting'
> = {
  [WebSocketStatus.CONNECTED]: 'connected',
  [WebSocketStatus.CONNECTING]: 'connecting',
  [WebSocketStatus.RECONNECTING]: 'reconnecting',
  [WebSocketStatus.DISCONNECTED]: 'disconnected',
  [WebSocketStatus.TERMINATED]: 'disconnected',
};

/** Resolve active waiter/user identifier from explicit props or stored shell session. */
export function resolveEffectiveUserId(
  userId?: string,
  waiterId?: string,
  storedUser?: { id?: string; sub?: string } | null,
): string {
  return userId || waiterId || storedUser?.id || storedUser?.sub || 'waiter-default';
}

/** Check whether a draft order line has a missing or non-positive integer quantity. */
export function hasInvalidDraftItemQuantity(item: EditableOrderItem): boolean {
  return (
    typeof item.quantity !== 'number' ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1
  );
}

/** Derive UI action permissions from an order's current lifecycle state. */
export function computeOrderActionPermissions(order?: Order): OrderActionPermissions {
  const status = order?.status;
  const isCreated = status === OrderStatus.CREATED;
  const isReserved = status === OrderStatus.RESERVED;
  const isRejected = status === OrderStatus.REJECTED;
  const isExpired = status === OrderStatus.EXPIRED;
  const isCancelled = status === OrderStatus.CANCELLED;
  const unconfirmedCreated = isCreated && !order?.confirmedAt;
  const allItemsDelivered = Boolean(
    order?.items.length &&
      order.items.every(
        (item) => item.status === ItemStatus.DELIVERED || item.status === ItemStatus.CANCELLED,
      ),
  );

  return {
    isRejected,
    canCancel: Boolean(isCreated || isReserved || isRejected || isExpired),
    canEdit: Boolean(unconfirmedCreated || isRejected || isExpired),
    canConfirm: Boolean(unconfirmedCreated || isExpired),
    canRequestBill: Boolean(status === OrderStatus.DELIVERED && allItemsDelivered),
    canResetToNew: Boolean(isCancelled || isExpired),
    showTerminalResetButton: Boolean(isExpired || isCancelled),
  };
}

/** Apply an inbound monotonic WebSocket status event to the cached order query state. */
export function applyRealtimeStatusChange(
  currentOrder: Order | undefined,
  event: OrderStatusChangedEvent,
): Order | undefined {
  if (!currentOrder || event.version <= currentOrder.version) {
    return currentOrder;
  }
  return {
    ...currentOrder,
    status: event.status,
    version: event.version,
    rejectionDetails: event.rejectionDetails ?? currentOrder.rejectionDetails,
    awaitingStockConfirmation:
      event.status === OrderStatus.CREATED
        ? currentOrder.awaitingStockConfirmation
        : false,
  };
}

/** Translate an API or unexpected error into a Spanish user-facing message. */
export function getDisplayError(error: unknown): string {
  return error instanceof ApiError
    ? getErrorMessage(error.code)
    : getErrorMessage(undefined);
}

/** Replace underscore/hyphen separators in raw ingredient names for display. */
export function formatIngredientName(name: string): string {
  return name.replaceAll(/[_-]+/g, ' ').trim();
}

/** Format a dining session UUID or prefixed token into a concise #XXXX label. */
export function formatSessionDisplay(sessionId: string): string {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
  if (isUuid) {
    return `#${sessionId.slice(-4).toUpperCase()}`;
  }
  const cleaned = sessionId.replace(/^(ses-|session-)/, '');
  return `#${cleaned || sessionId}`;
}

function parseItemIdentifier(itemObj: Record<string, unknown>): {
  offerId?: string;
  dishId?: string;
  itemId?: string;
} {
  const itemId = typeof itemObj.itemId === 'string' ? itemObj.itemId : undefined;
  const plateId = typeof itemObj.plateId === 'string' ? itemObj.plateId : undefined;
  const offerId = typeof itemObj.offerId === 'string' ? itemObj.offerId : itemId;
  const dishId = typeof itemObj.dishId === 'string' ? itemObj.dishId : (plateId ?? itemId);
  return { offerId, dishId, itemId };
}

function readNumericField(
  obj: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string,
): number | undefined {
  const primary = obj[primaryKey];
  if (typeof primary === 'number') {
    return primary;
  }
  const fallback = obj[fallbackKey];
  return typeof fallback === 'number' ? fallback : undefined;
}

function parseSingleRejectedItem(it: unknown): RejectedItemDetail {
  if (!it || typeof it !== 'object') {
    return {};
  }
  const itemObj = it as Record<string, unknown>;
  const availableQuantity =
    readNumericField(itemObj, 'availableQuantity', 'availableStock') ?? 0;
  const requestedQuantity =
    readNumericField(itemObj, 'requestedQuantity', 'quantity') ?? null;
  const itemName = typeof itemObj.itemName === 'string' ? itemObj.itemName : undefined;
  const name = typeof itemObj.name === 'string' ? itemObj.name : itemName;
  const reason = typeof itemObj.reason === 'string' ? itemObj.reason : undefined;

  return {
    ...parseItemIdentifier(itemObj),
    name,
    itemName,
    reason,
    requestedQuantity,
    availableQuantity,
    availableStock: availableQuantity,
  };
}

function extractRawArray(primary: unknown, fallback: unknown): unknown[] {
  if (Array.isArray(primary)) {
    return primary;
  }
  return Array.isArray(fallback) ? fallback : [];
}

/** Parse optional rejectionDetails object into a typed UI breakdown structure. */
export function parseRejectionDetails(details: unknown): ParsedRejectionDetails | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const raw = details as Record<string, unknown>;
  const missing = extractRawArray(raw.missingIngredients, raw.faltantes);
  const rejected = extractRawArray(raw.rejectedItems, raw.items).map((item) =>
    parseSingleRejectedItem(item),
  );
  const reserved = extractRawArray(raw.reservedItems, null) as ReservedItemDetail[];
  const reason =
    typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : undefined;

  const hasContent =
    missing.length > 0 ||
    rejected.length > 0 ||
    reserved.length > 0 ||
    Boolean(raw.source) ||
    Boolean(reason);

  if (!hasContent) {
    return null;
  }

  return {
    source: typeof raw.source === 'string' ? raw.source : undefined,
    reason,
    missingIngredients: missing.map((item) =>
      typeof item === 'string' || typeof item === 'number' ? String(item) : '',
    ),
    rejectedItems: rejected,
    reservedItems: reserved,
  };
}

/** Look up a human-readable dish name inside order items by dishId, id, or itemId. */
export function resolveDishName(
  dishIdOrOfferId: string | undefined,
  orderItems: readonly OrderItem[],
): string {
  if (!dishIdOrOfferId) {
    return 'Platillo';
  }
  const found = orderItems.find(
    (item) =>
      item.dishId === dishIdOrOfferId ||
      item.id === dishIdOrOfferId ||
      item.itemId === dishIdOrOfferId,
  );
  return found?.name ?? dishIdOrOfferId;
}

/** Return the alert banner copy corresponding to terminal/actionable order statuses. */
export function getOrderAlert(status: OrderStatusValue, entityNounLower = 'orden'): string {
  switch (status) {
    case OrderStatus.REJECTED:
      return `Motivo de rechazo: Inventario insuficiente. Modifica la ${entityNounLower} para ajustar cantidades o cancela.`;
    case OrderStatus.EXPIRED:
      return `La ${entityNounLower} expiró. Crea una nueva ${entityNounLower}.`;
    case OrderStatus.CANCELLED:
      return `La ${entityNounLower} ha sido cancelada.`;
    case OrderStatus.DELIVERED:
      return 'Entregada por cocina — recoger.';
    default:
      return '';
  }
}

/** Format the table or takeaway indicator for an existing order header. */
export function getTableOrTakeawayLabel(order: Order): string {
  if (order.isTakeaway) {
    return 'Para llevar';
  }
  return order.tableNumber ? `Mesa ${order.tableNumber}` : 'Mesa sin asignar';
}

/** Parse table number input when creating a non-takeaway order. */
export function parseTableNumber(
  isTakeaway: boolean,
  table: number | string,
): number | undefined {
  if (isTakeaway) {
    return undefined;
  }
  if (typeof table === 'number') {
    return table;
  }
  return Number.parseInt(String(table), 10) || 1;
}

/** Return a non-negative finite unit price or undefined when omitted/invalid. */
export function getValidUnitPrice(unitPrice: unknown): number | undefined {
  if (typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice >= 0) {
    return unitPrice;
  }
  return undefined;
}

/** Normalize an external event or dialog submission payload into an EditableOrderItem. */
export function createEditableOrderItem(source: EditableItemSource): EditableOrderItem {
  const effectiveDishId =
    source.sourceId || source.dishId || source.itemId || source.offerId;
  const validUnitPrice = getValidUnitPrice(source.unitPrice);
  const normalizedQty =
    typeof source.quantity === 'number' && source.quantity > 0 ? source.quantity : 1;

  return {
    dishId: effectiveDishId,
    sourceId: source.sourceId || source.dishId,
    offerId: source.offerId,
    itemId: source.itemId,
    ...(validUnitPrice !== undefined ? { unitPrice: validUnitPrice } : {}),
    name: source.name,
    quantity: normalizedQty,
    modifiers: Array.isArray(source.modifiers) ? [...source.modifiers] : [],
    notes: typeof source.notes === 'string' ? source.notes : '',
  };
}

/** Convert an EditableOrderItem into the payload expected by `PATCH /orders/{id}/items`. */
export function mapDraftItemToApiInput(item: EditableOrderItem): OrderItemApiInput {
  const resolvedDishId = item.sourceId || item.dishId || item.offerId || undefined;
  const parsedQty =
    typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 1;
  const validUnitPrice = getValidUnitPrice(item.unitPrice);

  return {
    id: item.id,
    itemId: item.itemId,
    dishId: resolvedDishId,
    ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    ...(item.offerId ? { offerId: item.offerId } : {}),
    ...(validUnitPrice !== undefined ? { unitPrice: validUnitPrice } : {}),
    name: item.name,
    quantity: parsedQty,
    modifiers: [...item.modifiers],
    notes: item.notes,
  };
}

/** Patch the cached KDS queue query data immediately after an item redo mutation. */
export function updateKdsQueueWithRedoItem(
  cachedOrders: Order[] | undefined,
  updatedOrder: Order,
  targetItemId: string,
  fallbackOrderId: string,
): Order[] | undefined {
  if (!cachedOrders) {
    return cachedOrders;
  }
  const updatedOrderId =
    updatedOrder.id ?? updatedOrder.orderId ?? updatedOrder.publicId ?? fallbackOrderId;

  return cachedOrders.map((cachedOrder) => {
    const cachedOrderId = cachedOrder.id ?? cachedOrder.orderId ?? cachedOrder.publicId;
    if (cachedOrderId !== updatedOrderId) {
      return cachedOrder;
    }

    const updatedItem = updatedOrder.items.find(
      (item) => (item.id ?? item.itemId ?? item.publicId) === targetItemId,
    );

    return {
      ...cachedOrder,
      status: updatedOrder.status,
      items: cachedOrder.items.map((cachedItem) => {
        const cachedItemId = cachedItem.id ?? cachedItem.itemId ?? cachedItem.publicId;
        return cachedItemId === targetItemId ? (updatedItem ?? cachedItem) : cachedItem;
      }),
    };
  });
}

const TERMINAL_INACTIVE_STATUSES: ReadonlySet<OrderStatusValue> = new Set([
  OrderStatus.PAID,
  OrderStatus.CANCELLED,
  OrderStatus.VOIDED,
  OrderStatus.WASTED,
]);

/** Whether an order belongs to the waiter's currently active shift view (delivered or pending). */
export function isOrderActiveInShift(order: Order): boolean {
  return !TERMINAL_INACTIVE_STATUSES.has(order.status);
}

function getOrderGroupDescriptor(order: Order): Omit<TableOrderGroup, 'orders'> {
  if (order.isTakeaway) {
    return { groupKey: 'takeaway', label: 'Para llevar', tableNumber: null, isTakeaway: true };
  }
  if (typeof order.tableNumber === 'number') {
    return {
      groupKey: `table:${order.tableNumber}`,
      label: `Mesa ${order.tableNumber}`,
      tableNumber: order.tableNumber,
      isTakeaway: false,
    };
  }
  return {
    groupKey: 'unassigned',
    label: 'Mesa sin asignar',
    tableNumber: null,
    isTakeaway: false,
  };
}

function groupSortRank(group: TableOrderGroup): number {
  if (group.tableNumber !== null) {
    return group.tableNumber;
  }
  return group.isTakeaway ? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER - 1;
}

/** Deduplicate and group active waiter shift orders by table number (takeaway grouped last). */
export function groupActiveOrdersByTable(orders: readonly Order[]): TableOrderGroup[] {
  const uniqueById = new Map<string, Order>();
  for (const order of orders) {
    const id = order.id ?? order.orderId ?? order.publicId;
    if (id && isOrderActiveInShift(order)) {
      uniqueById.set(id, order);
    }
  }

  const buckets = new Map<string, { meta: Omit<TableOrderGroup, 'orders'>; items: Order[] }>();
  for (const order of uniqueById.values()) {
    const meta = getOrderGroupDescriptor(order);
    const existing = buckets.get(meta.groupKey);
    if (existing) {
      existing.items.push(order);
    } else {
      buckets.set(meta.groupKey, { meta, items: [order] });
    }
  }

  return Array.from(buckets.values())
    .map(({ meta, items }) => ({
      ...meta,
      orders: [...items].sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0)),
    }))
    .sort((a, b) => groupSortRank(a) - groupSortRank(b));
}
