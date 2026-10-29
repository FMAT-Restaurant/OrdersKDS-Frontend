import { useMemo, useRef, useState } from 'react';
import {
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, createApiClient } from './shared/api/client.ts';
import { OrderSchema, type Order, type OrderItem } from './shared/api/schemas.ts';
import { queryClient } from './shared/api/queryClient.ts';
import {
  getErrorMessage,
  getRealtimeStatusMessage,
} from './shared/i18n/translate.ts';
import { useOrderEvents } from './shared/realtime/useOrderEvents.ts';
import {
  type OrderStatusChangedEvent,
  WebSocketStatus,
} from './shared/realtime/types.ts';
import type { TokenProvider } from './shared/types/auth.ts';
import {
  ItemStatus,
  OrderStatus,
  type OrderStatus as OrderStatusValue,
} from './shared/types/order.ts';
import './features/order-ticket/OrderTicketWidget.css';

export interface OrderTicketWidgetProps {
  orderId: string;
  userId: string;
  tokenProvider: TokenProvider;
  onCreateNewOrder: () => void;
  apiBaseUrl?: string;
  webSocketBaseUrl?: string;
}

interface EditableOrderItem {
  id?: string;
  itemId?: string;
  dishId?: string;
  name: string;
  quantity: number;
  modifiers: string[];
  notes: string;
}

const ORDER_QUERY_PREFIX = ['order'] as const;

const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  [OrderStatus.CREATED]: 'Creada',
  [OrderStatus.IN_PREPARATION]: 'En preparación',
  [OrderStatus.DELIVERED]: 'Entregada por cocina',
  [OrderStatus.PAID]: 'Pagada',
  [OrderStatus.CANCELLED]: 'Cancelada',
  [OrderStatus.REJECTED]: 'Rechazada',
  [OrderStatus.WASTED]: 'Merma',
  [OrderStatus.VOIDED]: 'Anulada',
  [OrderStatus.EXPIRED]: 'Expirada',
};

const ITEM_STATUS_LABELS: Record<
  (typeof ItemStatus)[keyof typeof ItemStatus],
  string
> = {
  [ItemStatus.PENDING]: 'Pendiente',
  [ItemStatus.READY]: 'Listo',
  [ItemStatus.DELIVERED]: 'Entregado',
};

const WEBSOCKET_STATUS_TRANSLATIONS: Record<
  (typeof WebSocketStatus)[keyof typeof WebSocketStatus],
  'connected' | 'connecting' | 'disconnected' | 'reconnecting'
> = {
  [WebSocketStatus.CONNECTED]: 'connected',
  [WebSocketStatus.CONNECTING]: 'connecting',
  [WebSocketStatus.RECONNECTING]: 'reconnecting',
  [WebSocketStatus.DISCONNECTED]: 'disconnected',
  [WebSocketStatus.TERMINATED]: 'disconnected',
};

function toEditableItems(items: OrderItem[]): EditableOrderItem[] {
  return items.map((item) => ({
    id: item.id,
    itemId: item.itemId,
    dishId: item.dishId,
    name: item.name,
    quantity: item.quantity,
    modifiers: item.modifiers ?? [],
    notes: item.notes ?? '',
  }));
}

function getDisplayError(error: unknown): string {
  if (error instanceof ApiError) {
    return getErrorMessage(error.code);
  }
  return getErrorMessage(undefined);
}

function getOrderAlert(status: OrderStatusValue): string {
  switch (status) {
    case OrderStatus.REJECTED:
      return 'La comanda fue rechazada. Crea una nueva comanda.';
    case OrderStatus.EXPIRED:
      return 'La comanda expiró. Crea una nueva comanda.';
    case OrderStatus.DELIVERED:
      return 'Entregada por cocina — recoger.';
    default:
      return '';
  }
}

function OrderTicket({
  orderId,
  userId,
  tokenProvider,
  onCreateNewOrder,
  apiBaseUrl,
  webSocketBaseUrl,
}: OrderTicketWidgetProps) {
  const client = useQueryClient();
  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, tokenProvider }),
    [apiBaseUrl, tokenProvider],
  );
  const queryKey = [...ORDER_QUERY_PREFIX, orderId];
  const channels = useMemo(() => ['floor', `user:${userId}`], [userId]);
  const [isEditing, setIsEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<EditableOrderItem[]>([]);
  const actionLock = useRef(false);

  const orderQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Order>(
        `/orders/${encodeURIComponent(orderId)}`,
        OrderSchema,
      ),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api.post<Order>(
        `/orders/${encodeURIComponent(orderId)}/confirm`,
        undefined,
        OrderSchema,
      ),
    onSuccess: (order) => {
      client.setQueryData<Order>(queryKey, {
        ...order,
        awaitingStockConfirmation: order.status === OrderStatus.CREATED,
      });
    },
    onSettled: () => {
      actionLock.current = false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(orderId)}/cancel`,
        undefined,
        OrderSchema,
      ),
    onSuccess: (order) => client.setQueryData(queryKey, order),
    onSettled: () => {
      actionLock.current = false;
    },
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(orderId)}/items`,
        {
          items: draftItems.map((item) => ({
            id: item.id,
            itemId: item.itemId,
            dishId: item.dishId,
            name: item.name,
            quantity: item.quantity,
            modifiers: item.modifiers,
            notes: item.notes,
          })),
        },
        OrderSchema,
      ),
    onSuccess: (order) => {
      client.setQueryData(queryKey, order);
      setIsEditing(false);
    },
    onSettled: () => {
      actionLock.current = false;
    },
  });

  const handleOrderStatusChanged = (event: OrderStatusChangedEvent) => {
    if (event.orderId !== orderId) {
      return;
    }

    client.setQueryData<Order>(queryKey, (currentOrder) => {
      if (!currentOrder || event.version <= currentOrder.version) {
        return currentOrder;
      }
      return {
        ...currentOrder,
        status: event.status,
        version: event.version,
        awaitingStockConfirmation:
          event.status === OrderStatus.CREATED
            ? currentOrder.awaitingStockConfirmation
            : false,
      };
    });
  };

  const { status: connectionStatus } = useOrderEvents({
    role: 'waiter',
    tokenProvider,
    channels,
    queryClient: client,
    baseUrl: webSocketBaseUrl,
    onOrderStatusChanged: handleOrderStatusChanged,
  });

  const isMutating =
    confirmMutation.isPending || cancelMutation.isPending || editMutation.isPending;
  const runMutation = (action: () => void) => {
    if (actionLock.current || isMutating) {
      return;
    }
    actionLock.current = true;
    action();
  };

  if (orderQuery.isPending) {
    return (
      <section className="order-ticket" aria-busy="true">
        <p role="status">Cargando comanda…</p>
      </section>
    );
  }

  if (orderQuery.isError) {
    return (
      <section className="order-ticket">
        <p className="order-ticket__error" role="alert">
          {getDisplayError(orderQuery.error)}
        </p>
        <button type="button" onClick={() => void orderQuery.refetch()}>
          Reintentar
        </button>
      </section>
    );
  }

  const order = orderQuery.data;
  const isCreated = order.status === OrderStatus.CREATED;
  const canEdit = isCreated && !order.confirmedAt;
  const canConfirm = isCreated && !order.confirmedAt;
  const canCancel = isCreated;
  const alertMessage = getOrderAlert(order.status);
  const connectionMessage = getRealtimeStatusMessage(
    WEBSOCKET_STATUS_TRANSLATIONS[connectionStatus],
  );

  const updateDraftItem = (
    index: number,
    update: Partial<EditableOrderItem>,
  ) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    );
  };

  const startEditing = () => {
    setDraftItems(toEditableItems(order.items));
    setIsEditing(true);
  };

  const submitEdits = () => {
    if (draftItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return;
    }
    runMutation(() => editMutation.mutate());
  };

  return (
    <section className="order-ticket" aria-labelledby="order-ticket-title">
      <header className="order-ticket__header">
        <div>
          <h2 id="order-ticket-title">
            Comanda {order.publicId ?? order.id ?? order.orderId ?? orderId}
          </h2>
          <p>
            {order.isTakeaway
              ? 'Para llevar'
              : order.tableNumber
                ? `Mesa ${order.tableNumber}`
                : 'Mesa sin asignar'}
          </p>
        </div>
        <span className="order-ticket__status" data-status={order.status}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </header>

      {order.awaitingStockConfirmation && (
        <p className="order-ticket__stock-status" role="status">
          Pendiente de confirmación de stock
        </p>
      )}

      <p className="order-ticket__connection" role="status" aria-live="polite">
        {connectionMessage}
      </p>

      {alertMessage && (
        <div className="order-ticket__alert" role="status" aria-live="assertive">
          <p>{alertMessage}</p>
          {(order.status === OrderStatus.REJECTED ||
            order.status === OrderStatus.EXPIRED) && (
            <button type="button" onClick={onCreateNewOrder}>
              Crear una nueva comanda
            </button>
          )}
        </div>
      )}

      <div className="order-ticket__items">
        <h3>Platillos</h3>
        {order.items.length === 0 ? (
          <p>Esta comanda todavía no tiene platillos.</p>
        ) : (
          <ul>
            {order.items.map((item, index) => {
              const key = item.id ?? item.itemId ?? `${item.name}-${index}`;
              const draft = draftItems[index];
              return (
                <li className="order-ticket__item" key={key}>
                  {isEditing && draft ? (
                    <div className="order-ticket__item-editor">
                      <strong>{draft.name}</strong>
                      <label>
                        Cantidad de {draft.name}
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={draft.quantity}
                          onChange={(event) =>
                            updateDraftItem(index, { quantity: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Modificadores de {draft.name}
                        <input
                          type="text"
                          value={draft.modifiers.join(', ')}
                          onChange={(event) =>
                            updateDraftItem(index, {
                              modifiers: event.target.value
                                .split(',')
                                .map((modifier) => modifier.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label>
                        Notas de {draft.name}
                        <textarea
                          value={draft.notes}
                          onChange={(event) =>
                            updateDraftItem(index, { notes: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <div className="order-ticket__item-title">
                        <strong>{item.quantity} × {item.name}</strong>
                        <span>{ITEM_STATUS_LABELS[item.status]}</span>
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <p>Modificadores: {item.modifiers.join(', ')}</p>
                      )}
                      {item.notes && <p>Nota: {item.notes}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmMutation.isError && (
        <p className="order-ticket__error" role="alert">
          {getDisplayError(confirmMutation.error)}
        </p>
      )}
      {cancelMutation.isError && (
        <p className="order-ticket__error" role="alert">
          {getDisplayError(cancelMutation.error)}
        </p>
      )}
      {editMutation.isError && (
        <p className="order-ticket__error" role="alert">
          {getDisplayError(editMutation.error)}
        </p>
      )}
      {isEditing &&
        draftItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1) && (
          <p className="order-ticket__error" role="alert">
            La cantidad de cada platillo debe ser un entero mayor que cero.
          </p>
        )}

      <footer className="order-ticket__actions">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={submitEdits}
              disabled={isMutating}
            >
              {editMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              className="order-ticket__button-secondary"
              disabled={isMutating}
              onClick={() => setIsEditing(false)}
            >
              Descartar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => runMutation(() => confirmMutation.mutate())}
              disabled={!canConfirm || isMutating}
            >
              {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              className="order-ticket__button-secondary"
              onClick={() => runMutation(() => cancelMutation.mutate())}
              disabled={!canCancel || isMutating}
            >
              {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar'}
            </button>
            <button
              type="button"
              className="order-ticket__button-secondary"
              onClick={startEditing}
              disabled={!canEdit || isMutating}
            >
              Modificar
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

export default function OrderTicketWidget(props: OrderTicketWidgetProps) {
  return (
    <div className="orders-kds-root">
      <QueryClientProvider client={queryClient}>
        <OrderTicket key={props.orderId} {...props} />
      </QueryClientProvider>
    </div>
  );
}
