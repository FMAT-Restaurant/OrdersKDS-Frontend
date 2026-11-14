/**
 * @file Custom hook subscribing OrderTicketWidget to Menu MFE window CustomEvents.
 * @satisfies RF-14, RF-17
 */

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Order } from '../../shared/api/schemas.ts';
import type { SelectedDishInfo } from './AddDishDialog.tsx';
import {
  mergeDraftItem,
  toEditableItems,
  type AddItemEventDetail,
  type EditableOrderItem,
} from './draftItemsHelper.ts';
import { createEditableOrderItem } from './orderTicketUtils.ts';

/** Parameters accepted by useExternalOrderEvents. */
export interface UseExternalOrderEventsParams {
  readonly isEditing: boolean;
  readonly order: Order | undefined;
  readonly setDraftItems: Dispatch<SetStateAction<EditableOrderItem[]>>;
  readonly setIsEditing: Dispatch<SetStateAction<boolean>>;
  readonly setSelectedDishForDialog: Dispatch<SetStateAction<SelectedDishInfo | null>>;
  readonly setIsAddDishOpen: Dispatch<SetStateAction<boolean>>;
}

const ADD_ITEM_EVENTS = ['fmat:comanda:add-item', 'fmat:orden:add-item'] as const;
const OPEN_DIALOG_EVENTS = [
  'fmat:comanda:open-add-dialog',
  'fmat:orden:open-add-dialog',
] as const;

/** Listen to external Menu MFE CustomEvents (`fmat:comanda:*` and `fmat:orden:*`) on window. */
export function useExternalOrderEvents({
  isEditing,
  order,
  setDraftItems,
  setIsEditing,
  setSelectedDishForDialog,
  setIsAddDishOpen,
}: Readonly<UseExternalOrderEventsParams>): void {
  useEffect(() => {
    const handleAddItemEvent = (event: Event) => {
      const customEvent = event as CustomEvent<AddItemEventDetail>;
      const detail = customEvent.detail;
      if (!detail?.name) {
        return;
      }

      const newItem = createEditableOrderItem(detail);
      setDraftItems((prevItems) => {
        const base = !isEditing && order ? toEditableItems(order.items) : prevItems;
        return mergeDraftItem(base, newItem);
      });
      setIsEditing(true);
    };

    const handleOpenAddDialogEvent = (event: Event) => {
      const customEvent = event as CustomEvent<SelectedDishInfo>;
      const detail = customEvent.detail;
      if (!detail?.name) {
        return;
      }

      setSelectedDishForDialog({
        dishId: detail.sourceId || detail.dishId,
        sourceId: detail.sourceId || detail.dishId,
        offerId: detail.offerId,
        itemId: detail.itemId,
        name: detail.name,
        unitPrice: detail.unitPrice,
      });
      setIsAddDishOpen(true);
    };

    for (const eventName of ADD_ITEM_EVENTS) {
      window.addEventListener(eventName, handleAddItemEvent);
    }
    for (const eventName of OPEN_DIALOG_EVENTS) {
      window.addEventListener(eventName, handleOpenAddDialogEvent);
    }

    return () => {
      for (const eventName of ADD_ITEM_EVENTS) {
        window.removeEventListener(eventName, handleAddItemEvent);
      }
      for (const eventName of OPEN_DIALOG_EVENTS) {
        window.removeEventListener(eventName, handleOpenAddDialogEvent);
      }
    };
  }, [
    isEditing,
    order,
    setDraftItems,
    setIsEditing,
    setSelectedDishForDialog,
    setIsAddDishOpen,
  ]);
}
