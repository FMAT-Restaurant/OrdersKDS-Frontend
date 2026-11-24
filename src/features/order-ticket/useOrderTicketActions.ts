/**
 * @file Custom hook and API workflow orchestrator for OrderTicketWidget mutations and creation flow.
 * @satisfies RF-12, RF-13, RF-14, RF-17, RF-22, RF-23, RNF-03
 */

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import { type createApiClient } from '../../shared/api/client.ts';
import { logDeveloperError } from '../../shared/api/devErrorLogger.ts';
import { OrderSchema, type Order, type OrderItem } from '../../shared/api/schemas.ts';
import { OrderStatus } from '../../shared/types/order.ts';
import type { EditableOrderItem } from './draftItemsHelper.ts';
import {
  ORDER_QUERY_PREFIX,
  mapDraftItemToApiInput,
  parseTableNumber,
  updateKdsQueueWithRedoItem,
} from './orderTicketUtils.ts';

/** Parameters required to execute the create + attach items (+ optional confirm) sequence. */
export interface CreateOrderParams {
  readonly api: ReturnType<typeof createApiClient>;
  readonly tableNumber: number | undefined;
  readonly isTakeaway: boolean;
  readonly diningSessionId: string | undefined;
  readonly items: readonly EditableOrderItem[];
  readonly confirm: boolean;
  readonly existingOrderId?: string;
  readonly onOrderHeaderCreated?: (orderId: string) => void;
  readonly onItemsAttached?: (order: Order, orderId: string) => void;
}

/** Input configuration for useOrderTicketActions. */
export interface UseOrderTicketActionsParams {
  readonly api: ReturnType<typeof createApiClient>;
  readonly client: QueryClient;
  readonly queryKey: readonly unknown[];
  readonly activeOrderId: string | undefined;
  readonly draftItems: readonly EditableOrderItem[];
  readonly draftTableNumber: number | string;
  readonly draftIsTakeaway: boolean;
  readonly effectiveDiningSessionId: string | undefined;
  readonly hasInvalidQuantities: boolean;
  readonly setActiveOrderId: Dispatch<SetStateAction<string | undefined>>;
  readonly setIsEditing: Dispatch<SetStateAction<boolean>>;
  readonly setSelectedRedoItem: Dispatch<SetStateAction<OrderItem | null>>;
  readonly onOrderCreated?: (order: Order) => void;
  readonly onOrderSubmitted?: (orderId: string) => void;
  readonly onOrderCancelled?: () => void;
  readonly onBillRequested?: (order: Order) => void;
}

/** Create an order, attach its draft items, and optionally confirm it for stock reservation. */
export async function executeCreateOrderSequence({
  api,
  tableNumber,
  isTakeaway,
  diningSessionId,
  items,
  confirm,
  existingOrderId,
  onOrderHeaderCreated,
  onItemsAttached,
}: CreateOrderParams): Promise<{ order: Order; orderId: string }> {
  let createdId = existingOrderId;
  if (!createdId) {
    const created = await api.post<Order>(
      '/orders',
      {
        tableNumber,
        isTakeaway,
        diningSessionId,
      },
      OrderSchema,
    );
    createdId = created.id ?? created.orderId ?? created.publicId;
    if (!createdId) {
      throw new Error('No se pudo obtener el identificador de la orden creada.');
    }
    onOrderHeaderCreated?.(createdId);
  }

  const withItems = await api.patch<Order>(
    `/orders/${encodeURIComponent(createdId)}/items`,
    { items: items.map((item) => mapDraftItemToApiInput(item)) },
    OrderSchema,
  );
  onItemsAttached?.(withItems, createdId);

  const finalOrder = confirm
    ? await api.post<Order>(
        `/orders/${encodeURIComponent(createdId)}/confirm`,
        undefined,
        OrderSchema,
      )
    : withItems;

  return { order: finalOrder, orderId: createdId };
}

/** Encapsulates serialized order mutations (create, confirm, cancel, edit, redo) with action locking. */
export function useOrderTicketActions({
  api,
  client,
  queryKey,
  activeOrderId,
  draftItems,
  draftTableNumber,
  draftIsTakeaway,
  effectiveDiningSessionId,
  hasInvalidQuantities,
  setActiveOrderId,
  setIsEditing,
  setSelectedRedoItem,
  onOrderCreated,
  onOrderSubmitted,
  onOrderCancelled,
  onBillRequested,
}: Readonly<UseOrderTicketActionsParams>) {
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const actionLock = useRef(false);
  const pendingDraftOrderIdRef = useRef<string | undefined>(undefined);

  const releaseLock = () => {
    actionLock.current = false;
  };

  const clearPendingDraftOrder = useCallback(() => {
    pendingDraftOrderIdRef.current = undefined;
  }, []);

  const invalidateShiftOrders = () => {
    void client.invalidateQueries({ queryKey: [...ORDER_QUERY_PREFIX, 'shift-list'] });
  };

  const confirmMutation = useMutation({
    mutationFn: () =>
      api.post<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/confirm`,
        undefined,
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData<Order>(queryKey, {
        ...updated,
        awaitingStockConfirmation: updated.status === OrderStatus.CREATED,
      });
      invalidateShiftOrders();
      if (activeOrderId) {
        onOrderSubmitted?.(activeOrderId);
      }
    },
    onError: (err) => {
      logDeveloperError(
        'OrderTicket',
        `POST /orders/${activeOrderId ?? 'unknown'}/confirm`,
        err,
      );
    },
    onSettled: releaseLock,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/cancel`,
        undefined,
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData(queryKey, updated);
      invalidateShiftOrders();
      onOrderCancelled?.();
    },
    onError: (err) => {
      logDeveloperError(
        'OrderTicket',
        `PATCH /orders/${activeOrderId ?? 'unknown'}/cancel`,
        err,
      );
      void client.invalidateQueries({ queryKey });
      invalidateShiftOrders();
    },
    onSettled: releaseLock,
  });

  const redoMutation = useMutation({
    mutationFn: ({ itemId, note }: { itemId: string; note: string }) =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/items/${encodeURIComponent(itemId)}/redo`,
        { note },
        OrderSchema,
      ),
    onSuccess: (updatedOrder, { itemId }) => {
      client.setQueryData<Order>(queryKey, updatedOrder);
      client.setQueriesData<Order[]>(
        { queryKey: ['kds', 'queue'] },
        (cachedOrders) =>
          updateKdsQueueWithRedoItem(cachedOrders, updatedOrder, itemId, activeOrderId!),
      );
      setSelectedRedoItem(null);
    },
    onError: (err) => {
      logDeveloperError(
        'OrderTicket',
        `PATCH /orders/${activeOrderId ?? 'unknown'}/items/redo`,
        err,
      );
    },
    onSettled: releaseLock,
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/items`,
        { items: draftItems.map((item) => mapDraftItemToApiInput(item)) },
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData(queryKey, updated);
      setIsEditing(false);
      invalidateShiftOrders();
    },
    onError: (err) => {
      logDeveloperError(
        'OrderTicket',
        `PATCH /orders/${activeOrderId ?? 'unknown'}/items`,
        err,
      );
    },
    onSettled: releaseLock,
  });

  const requestBillMutation = useMutation({
    mutationFn: () =>
      api.post<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/request-bill`,
        undefined,
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData(queryKey, updated);
      invalidateShiftOrders();
      onBillRequested?.(updated);
    },
    onError: (err) => {
      logDeveloperError(
        'OrderTicket',
        `POST /orders/${activeOrderId ?? 'unknown'}/request-bill`,
        err,
      );
    },
    onSettled: releaseLock,
  });

  const isMutating =
    confirmMutation.isPending ||
    cancelMutation.isPending ||
    editMutation.isPending ||
    redoMutation.isPending ||
    requestBillMutation.isPending ||
    isCreating;

  const runMutation = (action: () => void) => {
    if (actionLock.current || isMutating) {
      return;
    }
    actionLock.current = true;
    action();
  };

  const submitEdits = () => {
    if (!hasInvalidQuantities) {
      runMutation(() => editMutation.mutate());
    }
  };

  const submitRedo = async (item: OrderItem, note: string) => {
    const itemId = item.id ?? item.itemId ?? item.publicId;
    if (!itemId) {
      throw new Error('No se pudo identificar el platillo que se va a rehacer.');
    }
    if (actionLock.current || isMutating) {
      throw new Error('Espera a que termine la acción actual antes de rehacer otro platillo.');
    }
    actionLock.current = true;
    await redoMutation.mutateAsync({ itemId, note });
  };

  const handleCreateOrder = async (
    confirm: boolean,
    formatError: (error: unknown) => string,
  ) => {
    if (hasInvalidQuantities || actionLock.current || isMutating || isCreating) {
      return;
    }
    actionLock.current = true;
    setIsCreating(true);
    setCreateError(null);

    try {
      const tableNum = parseTableNumber(draftIsTakeaway, draftTableNumber);
      const { order: finalOrder, orderId: createdId } = await executeCreateOrderSequence({
        api,
        tableNumber: tableNum,
        isTakeaway: draftIsTakeaway,
        diningSessionId: effectiveDiningSessionId,
        items: draftItems,
        confirm,
        existingOrderId: pendingDraftOrderIdRef.current,
        onOrderHeaderCreated: (orderId) => {
          pendingDraftOrderIdRef.current = orderId;
        },
        onItemsAttached: (attachedOrder, orderId) => {
          pendingDraftOrderIdRef.current = undefined;
          setActiveOrderId(orderId);
          setIsEditing(false);
          client.setQueryData([...ORDER_QUERY_PREFIX, orderId], attachedOrder);
          invalidateShiftOrders();
          onOrderCreated?.(attachedOrder);
        },
      });

      setActiveOrderId(createdId);
      setIsEditing(false);
      client.setQueryData([...ORDER_QUERY_PREFIX, createdId], {
        ...finalOrder,
        awaitingStockConfirmation: confirm && finalOrder.status === OrderStatus.CREATED,
      });
      if (confirm) {
        invalidateShiftOrders();
        onOrderSubmitted?.(createdId);
      }
    } catch (err) {
      logDeveloperError('OrderTicket', 'POST /orders + /items', err);
      setCreateError(formatError(err));
    } finally {
      releaseLock();
      setIsCreating(false);
    }
  };

  return {
    createError,
    isCreating,
    isMutating,
    confirmMutation,
    cancelMutation,
    redoMutation,
    editMutation,
    requestBillMutation,
    runMutation,
    submitEdits,
    submitRedo,
    handleCreateOrder,
    clearPendingDraftOrder,
  };
}
