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
