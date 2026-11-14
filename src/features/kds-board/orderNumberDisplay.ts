import type { Order, OrderItem } from '../../shared/api/schemas.ts';

/**
 * Canonical helper to retrieve the primary identifier of an Order.
 * Consistently resolves `order.id ?? order.orderId ?? order.publicId ?? ''`.
 */
export function getOrderKey(order: Pick<Order, 'id'> & Partial<Order>): string {
  return order.id ?? order.orderId ?? order.publicId ?? '';
}

/**
 * Canonical helper to retrieve the primary identifier of an OrderItem.
 * Consistently resolves `item.id ?? item.itemId ?? item.publicId ?? (fallbackIndex !== undefined ? 'item-${fallbackIndex}' : '')`.
 */
export function getItemKey(
  item: Pick<OrderItem, 'id'> & Partial<OrderItem>,
  fallbackIndex?: number,
): string {
  return (
    item.id ??
    item.itemId ??
    item.publicId ??
    (fallbackIndex !== undefined ? `item-${fallbackIndex}` : '')
  );
}

/**
 * Safely extracts a human-friendly short order number for KDS headers and dialogs.
 * Displays integer orderNumber (e.g. "66"), short UUID slice (last 4 uppercase chars), or cleaned string id.
 */
export function getOrderNumberDisplay(
  orderNumber: number | null | undefined,
  displayId: string,
): string {
  if (orderNumber != null) {
    return String(orderNumber);
  }
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(displayId);
  if (isUuid) {
    return displayId.slice(-4).toUpperCase();
  }
  return displayId.replace(/^ord-/, '');
}

