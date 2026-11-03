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
  readonly orderId: string;
  readonly userId: string;
  readonly tokenProvider: TokenProvider;
  readonly onCreateNewOrder: () => void;
  readonly apiBaseUrl?: string;
  readonly webSocketBaseUrl?: string;
  readonly diningSessionId?: string;
}

interface EditableOrderItem {
  readonly id?: string;
  readonly itemId?: string;
  readonly dishId?: string;
  readonly name: string;
  readonly quantity: number;
  readonly modifiers: string[];
  readonly notes: string;
}

interface RejectedItemDetail {
  readonly offerId?: string;
  readonly dishId?: string;
  readonly itemId?: string;
  readonly name?: string;
  readonly reason?: string;
  readonly requestedQuantity?: number | null;
  readonly availableQuantity?: number;
}

interface ReservedItemDetail {
  readonly offerId?: string;
  readonly dishId?: string;
  readonly name?: string;
  readonly quantity?: number;
  readonly reservedQuantity?: number;
}

interface ParsedRejectionDetails {
  readonly source?: string;
  readonly missingIngredients?: string[];
  readonly rejectedItems: readonly RejectedItemDetail[];
  readonly reservedItems: readonly ReservedItemDetail[];
}

const ORDER_QUERY_PREFIX = ['order'] as const;

const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
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

const ITEM_STATUS_LABELS: Record<
  (typeof ItemStatus)[keyof typeof ItemStatus],
  string
> = {
  [ItemStatus.PENDING]: 'Pendiente',
  [ItemStatus.READY]: 'Listo',
  [ItemStatus.DELIVERED]: 'Entregado',
  [ItemStatus.CANCELLED]: 'Cancelado',
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

function toEditableItems(items: readonly OrderItem[]): EditableOrderItem[] {
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

function parseRejectionDetails(details: unknown): ParsedRejectionDetails | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const raw = details as Record<string, unknown>;
  const missing =
    (Array.isArray(raw.missingIngredients) ? raw.missingIngredients : null) ??
    (Array.isArray(raw.faltantes) ? raw.faltantes : []);
  const rejected = Array.isArray(raw.rejectedItems)
    ? (raw.rejectedItems as RejectedItemDetail[])
    : [];
  const reserved = Array.isArray(raw.reservedItems)
    ? (raw.reservedItems as ReservedItemDetail[])
    : [];

  if (missing.length === 0 && rejected.length === 0 && reserved.length === 0 && !raw.source) {
    return null;
  }

  return {
    source: typeof raw.source === 'string' ? raw.source : undefined,
    missingIngredients: missing.map(String),
    rejectedItems: rejected,
    reservedItems: reserved,
  };
}

function resolveDishName(
  dishIdOrOfferId: string | undefined,
  orderItems: readonly OrderItem[],
): string {
  if (!dishIdOrOfferId) return 'Platillo';
  const found = orderItems.find(
    (item) =>
      item.dishId === dishIdOrOfferId ||
      item.id === dishIdOrOfferId ||
      item.itemId === dishIdOrOfferId,
  );
  return found?.name ?? dishIdOrOfferId;
}

function formatRejectionAlert(
  parsed: ParsedRejectionDetails,
  orderItems: readonly OrderItem[],
): string {
  const parts: string[] = [];
  if (parsed.rejectedItems.length > 0) {
    const itemsSummary = parsed.rejectedItems
      .map((item) => {
        const name = item.name ?? resolveDishName(item.dishId ?? item.offerId, orderItems);
        if (item.availableQuantity !== undefined && item.requestedQuantity !== undefined) {
          return `${name} (solicitados: ${item.requestedQuantity}, disponibles: ${item.availableQuantity})`;
        }
        if (item.reason) {
          return `${name} (${item.reason})`;
        }
        return name;
      })
      .join(', ');
    parts.push(`Insumos no disponibles: ${itemsSummary}.`);
  }
  if (parsed.missingIngredients && parsed.missingIngredients.length > 0) {
    parts.push(`Ingredientes faltantes: ${parsed.missingIngredients.join(', ')}.`);
  }
  if (parts.length > 0) {
    return `Comanda rechazada. ${parts.join(' ')} Modifica la comanda para ajustar cantidades o cancela.`;
  }
  return 'La comanda fue rechazada por falta de stock. Modifica la comanda para ajustar cantidades o cancela.';
}

function getOrderAlert(
  status: OrderStatusValue,
  rejectionDetails?: unknown,
  orderItems: readonly OrderItem[] = [],
): string {
  switch (status) {
    case OrderStatus.REJECTED: {
      const parsed = parseRejectionDetails(rejectionDetails);
      if (parsed) {
        return formatRejectionAlert(parsed, orderItems);
      }
      return 'La comanda fue rechazada por falta de stock. Modifica la comanda para ajustar cantidades o cancela.';
    }
    case OrderStatus.EXPIRED:
      return 'La comanda expiró. Crea una nueva comanda.';
    case OrderStatus.DELIVERED:
      return 'Entregada por cocina — recoger.';
    default:
      return '';
  }
}

function getTableOrTakeawayLabel(order: Order): string {
  if (order.isTakeaway) {
    return 'Para llevar';
  }
  if (order.tableNumber) {
    return `Mesa ${order.tableNumber}`;
  }
  return 'Mesa sin asignar';
}

interface RejectionBreakdownProps {
  readonly details: ParsedRejectionDetails;
  readonly orderItems: readonly OrderItem[];
}

function RejectionBreakdown({ details, orderItems }: Readonly<RejectionBreakdownProps>) {
  return (
    <div className="order-ticket__rejection-breakdown">
      <h3>Detalle de rechazo de stock</h3>
      {details.missingIngredients && details.missingIngredients.length > 0 && (
        <p className="order-ticket__missing-ingredients">
          <strong>Ingredientes faltantes:</strong> {details.missingIngredients.join(', ')}
        </p>
      )}
      {details.rejectedItems.length > 0 && (
        <div className="order-ticket__rejected-list">
          <h4>Platillos no disponibles</h4>
          <ul>
            {details.rejectedItems.map((item, idx) => {
              const dishName =
                item.name ?? resolveDishName(item.dishId ?? item.offerId, orderItems);
              return (
                <li key={`rejected-${item.offerId ?? item.itemId ?? idx}`}>
                  <strong>{dishName}</strong>
                  {item.availableQuantity !== undefined &&
                    item.requestedQuantity !== undefined && (
                      <span>
                        {' '}— Solicitados: {item.requestedQuantity}, Disponibles:{' '}
                        {item.availableQuantity}
                      </span>
                    )}
                  {item.reason && <span> — {item.reason}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {details.reservedItems.length > 0 && (
        <div className="order-ticket__reserved-list">
          <h4>Platillos pre-apartados (con stock)</h4>
          <ul>
            {details.reservedItems.map((item, idx) => {
              const dishName =
                item.name ?? resolveDishName(item.dishId ?? item.offerId, orderItems);
              const qty = item.quantity ?? item.reservedQuantity ?? 1;
              return (
                <li key={`reserved-${item.offerId ?? idx}`}>
                  <strong>{dishName}</strong>: {qty} apartados temporalmente
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface OrderItemsListProps {
  readonly items: readonly OrderItem[];
  readonly isEditing: boolean;
  readonly draftItems: readonly EditableOrderItem[];
  readonly onUpdateDraftItem: (index: number, update: Partial<EditableOrderItem>) => void;
  readonly onRemoveDraftItem: (index: number) => void;
}

function OrderItemsList({
  items,
  isEditing,
  draftItems,
  onUpdateDraftItem,
  onRemoveDraftItem,
}: Readonly<OrderItemsListProps>) {
  if (items.length === 0) {
    return (
      <div className="order-ticket__items">
        <h3>Platillos</h3>
        <p>Esta comanda todavía no tiene platillos.</p>
      </div>
    );
  }

  return (
    <div className="order-ticket__items">
      <h3>Platillos</h3>
      <ul>
        {items.map((item, index) => {
          const key = item.id ?? item.itemId ?? `${item.name}-${index}`;
          const draft = draftItems[index];

          if (isEditing && draft) {
            return (
              <li className="order-ticket__item" key={key}>
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
                        onUpdateDraftItem(index, { quantity: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Modificadores de {draft.name}
                    <input
                      type="text"
                      value={draft.modifiers.join(', ')}
                      onChange={(event) =>
                        onUpdateDraftItem(index, {
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
                        onUpdateDraftItem(index, { notes: event.target.value })
                      }
                    />
                  </label>
                  {draftItems.length > 1 && (
                    <button
                      type="button"
                      className="order-ticket__button-secondary order-ticket__item-remove"
                      onClick={() => onRemoveDraftItem(index)}
                    >
                      Quitar platillo
                    </button>
                  )}
                </div>
              </li>
            );
          }

          return (
            <li className="order-ticket__item" key={key}>
              <div className="order-ticket__item-title">
                <strong>
                  {item.quantity} × {item.name}
                </strong>
                <span>{ITEM_STATUS_LABELS[item.status]}</span>
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <p>Modificadores: {item.modifiers.join(', ')}</p>
              )}
              {item.notes && <p>Nota: {item.notes}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface OrderTicketActionsProps {
  readonly isEditing: boolean;
  readonly isMutating: boolean;
  readonly isEditPending: boolean;
  readonly isConfirmPending: boolean;
  readonly isCancelPending: boolean;
  readonly canConfirm: boolean;
  readonly canCancel: boolean;
  readonly canEdit: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onStartEditing: () => void;
  readonly onSubmitEdits: () => void;
  readonly onDiscardEdits: () => void;
}

function OrderTicketActions({
  isEditing,
  isMutating,
  isEditPending,
  isConfirmPending,
  isCancelPending,
  canConfirm,
  canCancel,
  canEdit,
  onConfirm,
  onCancel,
  onStartEditing,
  onSubmitEdits,
  onDiscardEdits,
}: Readonly<OrderTicketActionsProps>) {
  if (isEditing) {
    return (
      <footer className="order-ticket__actions">
        <button type="button" onClick={onSubmitEdits} disabled={isMutating}>
          {isEditPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          className="order-ticket__button-secondary"
          disabled={isMutating}
          onClick={onDiscardEdits}
        >
          Descartar
        </button>
      </footer>
    );
  }

  return (
    <footer className="order-ticket__actions">
      <button type="button" onClick={onConfirm} disabled={!canConfirm || isMutating}>
        {isConfirmPending ? 'Confirmando…' : 'Confirmar'}
      </button>
      <button
        type="button"
        className="order-ticket__button-secondary"
        onClick={onCancel}
        disabled={!canCancel || isMutating}
      >
        {isCancelPending ? 'Cancelando…' : 'Cancelar'}
      </button>
      <button
        type="button"
        className="order-ticket__button-secondary"
        onClick={onStartEditing}
        disabled={!canEdit || isMutating}
      >
        Modificar
      </button>
    </footer>
  );
}

function OrderTicket({
  orderId,
  userId,
  tokenProvider,
  onCreateNewOrder,
  apiBaseUrl,
  webSocketBaseUrl,
  diningSessionId: propDiningSessionId,
}: Readonly<OrderTicketWidgetProps>) {
  const client = useQueryClient();
  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, tokenProvider }),
    [apiBaseUrl, tokenProvider],
  );
  const queryKey = useMemo(() => [...ORDER_QUERY_PREFIX, orderId], [orderId]);
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
        rejectionDetails:
          event.rejectionDetails !== undefined
            ? event.rejectionDetails
            : currentOrder.rejectionDetails,
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
        <output>Cargando comanda…</output>
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
  const isReserved = order.status === OrderStatus.RESERVED;
  const isRejected = order.status === OrderStatus.REJECTED;

  // "Cancelar" activo en CREATED (incluso confirmada), en RESERVED y en REJECTED (DoD)
  const canCancel = isCreated || isReserved || isRejected;

  // "Modificar" habilitado en CREATED sin confirmedAt, y en REJECTED (DoD / ADR-0016)
  const canEdit = (isCreated && !order.confirmedAt) || isRejected;

  // "Confirmar" habilitado en CREATED sin confirmedAt
  const canConfirm = isCreated && !order.confirmedAt;

  const rejectionDetailsParsed = parseRejectionDetails(order.rejectionDetails);
  const alertMessage = getOrderAlert(order.status, order.rejectionDetails, order.items);
  const connectionMessage = getRealtimeStatusMessage(
    WEBSOCKET_STATUS_TRANSLATIONS[connectionStatus],
  );

  const effectiveDiningSessionId = order.diningSessionId || propDiningSessionId;
  const tableOrTakeawayLabel = getTableOrTakeawayLabel(order);

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

  const removeDraftItem = (index: number) => {
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const startEditing = () => {
    setDraftItems(toEditableItems(order.items));
    setIsEditing(true);
  };

  const submitEdits = () => {
    if (
      draftItems.length === 0 ||
      draftItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)
    ) {
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
            {tableOrTakeawayLabel}
            {effectiveDiningSessionId && (
              <span className="order-ticket__session">
                {' '}· Sesión {effectiveDiningSessionId.slice(0, 8)}
              </span>
            )}
          </p>
        </div>
        <span className="order-ticket__status" data-status={order.status}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </header>

      {order.awaitingStockConfirmation && (
        <output className="order-ticket__stock-status">
          Pendiente de confirmación de stock
        </output>
      )}

      <output className="order-ticket__connection" aria-live="polite">
        {connectionMessage}
      </output>

      {alertMessage && (
        <div className="order-ticket__alert" role="status" aria-live="assertive">
          <p>{alertMessage}</p>
          {order.status === OrderStatus.EXPIRED && (
            <button type="button" onClick={onCreateNewOrder}>
              Crear una nueva comanda
            </button>
          )}
        </div>
      )}

      {isRejected && rejectionDetailsParsed && (
        <RejectionBreakdown details={rejectionDetailsParsed} orderItems={order.items} />
      )}

      <OrderItemsList
        items={order.items}
        isEditing={isEditing}
        draftItems={draftItems}
        onUpdateDraftItem={updateDraftItem}
        onRemoveDraftItem={removeDraftItem}
      />

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
        (draftItems.length === 0 ||
          draftItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) && (
          <p className="order-ticket__error" role="alert">
            La cantidad de cada platillo debe ser un entero mayor que cero y debe haber al menos un platillo.
          </p>
        )}

      <OrderTicketActions
        isEditing={isEditing}
        isMutating={isMutating}
        isEditPending={editMutation.isPending}
        isConfirmPending={confirmMutation.isPending}
        isCancelPending={cancelMutation.isPending}
        canConfirm={canConfirm}
        canCancel={canCancel}
        canEdit={canEdit}
        onConfirm={() => runMutation(() => confirmMutation.mutate())}
        onCancel={() => runMutation(() => cancelMutation.mutate())}
        onStartEditing={startEditing}
        onSubmitEdits={submitEdits}
        onDiscardEdits={() => setIsEditing(false)}
      />
    </section>
  );
}

export default function OrderTicketWidget(props: Readonly<OrderTicketWidgetProps>) {
  return (
    <div className="orders-kds-root">
      <QueryClientProvider client={queryClient}>
        <OrderTicket key={props.orderId} {...props} />
      </QueryClientProvider>
    </div>
  );
}
