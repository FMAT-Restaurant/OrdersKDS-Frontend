import type { OrderItem } from '../../shared/api/schemas.ts';

export interface EditableOrderItem {
  readonly id?: string;
  readonly itemId?: string;
  readonly dishId?: string;
  readonly sourceId?: string;
  readonly offerId?: string;
  readonly name: string;
  quantity: number | string;
  readonly modifiers: string[];
  readonly notes: string;
}

export interface AddItemEventDetail {
  readonly dishId?: string;
  readonly itemId?: string;
  readonly sourceId?: string;
  readonly offerId?: string;
  readonly name: string;
  readonly quantity?: number;
  readonly unitPrice?: number;
  readonly modifiers?: string[];
  readonly notes?: string;
}

export function mergeDraftItem(
  currentItems: readonly EditableOrderItem[],
  newItem: EditableOrderItem,
): EditableOrderItem[] {
  const normalizedNewName = newItem.name.trim().toLowerCase();
  const normalizedNewNotes = newItem.notes.trim().toLowerCase();
  const newModifiersSorted = [...newItem.modifiers]
    .sort((a, b) => a.localeCompare(b))
    .join(',');

  const existingIndex = currentItems.findIndex((item) => {
    const sameSourceId = newItem.sourceId && item.sourceId && newItem.sourceId === item.sourceId;
    const sameDishId = newItem.dishId && item.dishId && newItem.dishId === item.dishId;
    const sameName = item.name.trim().toLowerCase() === normalizedNewName;
    const sameNotes = item.notes.trim().toLowerCase() === normalizedNewNotes;
    const sameModifiers =
      [...item.modifiers].sort((a, b) => a.localeCompare(b)).join(',') ===
      newModifiersSorted;

    return (sameSourceId || sameDishId || sameName) && sameNotes && sameModifiers;
  });

  if (existingIndex >= 0) {
    const existing = currentItems[existingIndex];
    const existingQty =
      typeof existing.quantity === 'number'
        ? existing.quantity
        : Number.parseInt(String(existing.quantity), 10) || 1;
    const addQty =
      typeof newItem.quantity === 'number'
        ? newItem.quantity
        : Number.parseInt(String(newItem.quantity), 10) || 1;

    return currentItems.map((item, idx) =>
      idx === existingIndex
        ? { ...item, quantity: existingQty + addQty }
        : item,
    );
  }

  return [...currentItems, newItem];
}

export function toEditableItems(items: readonly OrderItem[]): EditableOrderItem[] {
  return items.map((item) => ({
    id: item.id,
    itemId: item.itemId,
    dishId: item.dishId ?? undefined,
    sourceId: item.dishId ?? undefined,
    name: item.name,
    quantity: item.quantity,
    modifiers: item.modifiers ?? [],
    notes: item.notes ?? '',
  }));
}

