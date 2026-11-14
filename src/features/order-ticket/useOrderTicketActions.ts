/**
 * @file Custom hook and API workflow orchestrator for OrderTicketWidget mutations and creation flow.
 * @satisfies RF-12, RF-13, RF-14, RF-17, RF-22, RF-23, RNF-03
 */

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import { type createApiClient } from '../../shared/api/client.ts';
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
}

/** Create an order, attach its draft items, and optionally confirm it for stock reservation. */
export async function executeCreateOrderSequence({
  api,
  tableNumber,
  isTakeaway,
  diningSessionId,
  items,
  confirm,
}: CreateOrderParams): Promise<{ order: Order; orderId: string }> {
  const created = await api.post<Order>(
    '/orders',
    {
      tableNumber,
      isTakeaway,
      diningSessionId,
    },
    OrderSchema,
  );

  const createdId = created.id ?? created.orderId ?? created.publicId;
  if (!createdId) {
    throw new Error('No se pudo obtener el identificador de la orden creada.');
  }

  const withItems = await api.patch<Order>(
    `/orders/${encodeURIComponent(createdId)}/items`,
    { items: items.map(mapDraftItemToApiInput) },
    OrderSchema,
  );

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
}: Readonly<UseOrderTicketActionsParams>) {
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const actionLock = useRef(false);

  const releaseLock = () => {
    actionLock.current = false;
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
      if (activeOrderId) {
        onOrderSubmitted?.(activeOrderId);
      }
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
      onOrderCancelled?.();
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
    onSettled: releaseLock,
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/items`,
        { items: draftItems.map(mapDraftItemToApiInput) },
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData(queryKey, updated);
      setIsEditing(false);
    },
    onSettled: releaseLock,
  });

  const isMutating =
    confirmMutation.isPending ||
    cancelMutation.isPending ||
    editMutation.isPending ||
    redoMutation.isPending ||
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
      });

      setActiveOrderId(createdId);
      setIsEditing(false);
      client.setQueryData([...ORDER_QUERY_PREFIX, createdId], {
        ...finalOrder,
        awaitingStockConfirmation: confirm && finalOrder.status === OrderStatus.CREATED,
      });
      onOrderCreated?.(finalOrder);
      if (confirm) {
        onOrderSubmitted?.(createdId);
      }
    } catch (err) {
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
    runMutation,
    submitEdits,
    submitRedo,
    handleCreateOrder,
  };
}
