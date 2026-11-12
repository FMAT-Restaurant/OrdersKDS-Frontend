import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RedoItemDialog } from './features/order-ticket/RedoItemDialog.tsx';
import {
  AddDishDialog,
  type NewDishData,
  type SelectedDishInfo,
} from './features/order-ticket/AddDishDialog.tsx';
import {
  mergeDraftItem,
  toEditableItems,
  type AddItemEventDetail,
  type EditableOrderItem,
} from './features/order-ticket/draftItemsHelper.ts';
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
import { getOrderNumberDisplay } from './features/kds-board/orderNumberDisplay.ts';
import './features/order-ticket/OrderTicketWidget.css';

export type { AddItemEventDetail, EditableOrderItem };

export interface OrderTicketWidgetProps {
  readonly orderId?: string;
  readonly tableNumber?: number | string;
  readonly isTakeaway?: boolean;
  readonly userId?: string;
  readonly waiterId?: string;
  readonly tokenProvider: TokenProvider;
  readonly onCreateNewOrder?: () => void;
  readonly onOrderCreated?: (order: Order) => void;
  readonly onOrderSubmitted?: (orderId: string) => void;
  readonly onOrderCancelled?: () => void;
  readonly apiBaseUrl?: string;
  readonly webSocketBaseUrl?: string;
  readonly diningSessionId?: string;
  readonly fetchFn?: typeof fetch;
  readonly WebSocketClass?: typeof WebSocket;
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

function getDisplayError(error: unknown): string {
  if (error instanceof ApiError) {
    return getErrorMessage(error.code);
  }
  return getErrorMessage(undefined);
}

function formatIngredientName(name: string): string {
  return name.replace(/[_-]+/g, ' ').trim();
}

function formatSessionDisplay(sessionId: string): string {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
  if (isUuid) {
    return `#${sessionId.slice(-4).toUpperCase()}`;
  }
  const cleaned = sessionId.replace(/^(ses-|session-)/, '');
  return `#${cleaned || sessionId}`;
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

function getOrderAlert(status: OrderStatusValue): string {
  switch (status) {
    case OrderStatus.REJECTED:
      return 'Motivo de rechazo: Inventario insuficiente. Modifica la comanda para ajustar cantidades o cancela.';
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

function parseTableNumber(isTakeaway: boolean, table: number | string): number | undefined {
  if (isTakeaway) {
    return undefined;
  }
  if (typeof table === 'number') {
    return table;
  }
  return Number.parseInt(String(table), 10) || 1;
}

function updateKdsQueueWithRedoItem(
  cachedOrders: Order[] | undefined,
  updatedOrder: Order,
  targetItemId: string,
  fallbackOrderId: string,
): Order[] | undefined {
  if (!cachedOrders) return cachedOrders;
  const updatedOrderId =
    updatedOrder.id ?? updatedOrder.orderId ?? updatedOrder.publicId ?? fallbackOrderId;

  return cachedOrders.map((cachedOrder) => {
    const cachedOrderId = cachedOrder.id ?? cachedOrder.orderId ?? cachedOrder.publicId;
    if (cachedOrderId !== updatedOrderId) return cachedOrder;

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

interface RejectionBreakdownProps {
  readonly details: ParsedRejectionDetails;
  readonly orderItems: readonly OrderItem[];
}

function RejectionBreakdown({ details, orderItems }: Readonly<RejectionBreakdownProps>) {
  return (
    <div className="order-ticket__rejection-breakdown">
      <h3>Detalle de rechazo de inventario</h3>
      {details.missingIngredients && details.missingIngredients.length > 0 && (
        <p className="order-ticket__missing-ingredients">
          <strong>Ingredientes faltantes:</strong>{' '}
          {details.missingIngredients.map(formatIngredientName).join(', ')}
        </p>
      )}
      {details.rejectedItems.length > 0 && (
        <div className="order-ticket__rejected-list">
          <h4>Platillos no disponibles</h4>
          <ul>
            {details.rejectedItems.map((item, idx) => {
              const dishName =
                item.name ?? resolveDishName(item.dishId ?? item.offerId, orderItems);
              const formattedReason = item.reason
                ? item.reason.replace(/stock/gi, 'inventario')
                : undefined;
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
                  {formattedReason && <span> — {formattedReason}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {details.reservedItems.length > 0 && (
        <div className="order-ticket__reserved-list">
          <h4>Platillos pre-apartados (con inventario)</h4>
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

interface OrderDraftHeaderProps {
  readonly draftTableNumber: number | string;
  readonly draftIsTakeaway: boolean;
  readonly isMutating: boolean;
  readonly diningSessionId?: string;
  readonly onTableNumberChange: (table: number | string) => void;
  readonly onTakeawayChange: (takeaway: boolean) => void;
}

function OrderDraftHeader({
  draftTableNumber,
  draftIsTakeaway,
  isMutating,
  diningSessionId,
  onTableNumberChange,
  onTakeawayChange,
}: Readonly<OrderDraftHeaderProps>) {
  return (
    <header className="order-ticket__header">
      <div>
        <h2 id="order-ticket-title">Nueva Comanda</h2>
        <div className="order-ticket__draft-table-controls">
          <label>
            <input
              type="checkbox"
              data-testid="draft-takeaway-checkbox"
              checked={draftIsTakeaway}
              disabled={isMutating}
              onChange={(e) => onTakeawayChange(e.target.checked)}
            />
            <span>Para llevar</span>
          </label>
          {!draftIsTakeaway && (
            <label>
              <span>Mesa: </span>
              <input
                type="number"
                min="1"
                data-testid="draft-table-input"
                className="order-ticket__table-input"
                value={draftTableNumber}
                disabled={isMutating}
                onChange={(e) => {
                  const val = e.target.value;
                  onTableNumberChange(val === '' ? '' : Number.parseInt(val, 10) || 1);
                }}
              />
            </label>
          )}
          {diningSessionId && (
            <span className="order-ticket__session">
              {' '}· Sesión {formatSessionDisplay(diningSessionId)}
            </span>
          )}
        </div>
      </div>
      <span className="order-ticket__status" data-status="DRAFT">
        Borrador
      </span>
    </header>
  );
}

interface OrderExistingHeaderProps {
  readonly order: Order;
  readonly orderId: string;
  readonly diningSessionId?: string;
}

function OrderExistingHeader({
  order,
  orderId,
  diningSessionId,
}: Readonly<OrderExistingHeaderProps>) {
  const effectiveSession = order.diningSessionId || diningSessionId;
  const tableOrTakeaway = getTableOrTakeawayLabel(order);
  const orderNumber = getOrderNumberDisplay(
    order.orderNumber,
    order.publicId ?? order.id ?? order.orderId ?? orderId,
  );

  return (
    <header className="order-ticket__header">
      <div>
        <h2 id="order-ticket-title">Comanda #{orderNumber}</h2>
        <p>
          {tableOrTakeaway}
          {effectiveSession && (
            <span className="order-ticket__session">
              {' '}· Sesión {formatSessionDisplay(effectiveSession)}
            </span>
          )}
        </p>
      </div>
      <span className="order-ticket__status" data-status={order.status}>
        {ORDER_STATUS_LABELS[order.status]}
      </span>
    </header>
  );
}

interface EditableItemRowProps {
  readonly draft: EditableOrderItem;
  readonly index: number;
  readonly isMutating: boolean;
  readonly canRemove: boolean;
  readonly onUpdate: (index: number, update: Partial<EditableOrderItem>) => void;
  readonly onRemove: (index: number) => void;
}

function EditableItemRow({
  draft,
  index,
  isMutating,
  canRemove,
  onUpdate,
  onRemove,
}: Readonly<EditableItemRowProps>) {
  const numericQuantity =
    typeof draft.quantity === 'number'
      ? draft.quantity
      : Number.parseInt(String(draft.quantity), 10) || 0;

  return (
    <li className="order-ticket__item" key={draft.id ?? draft.itemId ?? `${draft.name}-${index}`}>
      <div className="order-ticket__item-editor">
        <strong>{draft.name}</strong>
        <label htmlFor={`item-qty-${index}`}>
          Cantidad de {draft.name}
        </label>
        <div className="order-ticket__stepper">
          <button
            type="button"
            className="order-ticket__stepper-button"
            aria-label={`Disminuir cantidad de ${draft.name}`}
            disabled={numericQuantity <= 1 || isMutating}
            onClick={() => {
              if (numericQuantity > 1) {
                onUpdate(index, { quantity: numericQuantity - 1 });
              }
            }}
          >
            −
          </button>
          <input
            id={`item-qty-${index}`}
            type="number"
            min="1"
            step="1"
            className="order-ticket__stepper-input"
            value={draft.quantity}
            onChange={(event) => {
              const val = event.target.value;
              if (val === '') {
                onUpdate(index, { quantity: '' });
              } else {
                const parsed = Number.parseInt(val, 10);
                onUpdate(index, {
                  quantity: Number.isNaN(parsed) ? '' : parsed,
                });
              }
            }}
          />
          <button
            type="button"
            className="order-ticket__stepper-button"
            aria-label={`Aumentar cantidad de ${draft.name}`}
            disabled={isMutating}
            onClick={() => onUpdate(index, { quantity: numericQuantity + 1 })}
          >
            +
          </button>
        </div>
        <label>
          <span>Modificadores de {draft.name}</span>
          <input
            type="text"
            value={draft.modifiers.join(', ')}
            onChange={(event) =>
              onUpdate(index, {
                modifiers: event.target.value
                  .split(',')
                  .map((modifier) => modifier.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          <span>Notas de {draft.name}</span>
          <textarea
            value={draft.notes}
            onChange={(event) => onUpdate(index, { notes: event.target.value })}
          />
        </label>
        {canRemove && (
          <button
            type="button"
            className="order-ticket__button-secondary order-ticket__item-remove"
            onClick={() => onRemove(index)}
          >
            Quitar platillo
          </button>
        )}
      </div>
    </li>
  );
}

interface ReadOnlyItemRowProps {
  readonly item: OrderItem;
  readonly isMutating: boolean;
  readonly canRedo: boolean;
  readonly onRedoItem: (item: OrderItem) => void;
}

function ReadOnlyItemRow({
  item,
  isMutating,
  canRedo,
  onRedoItem,
}: Readonly<ReadOnlyItemRowProps>) {
  const key = item.id ?? item.itemId ?? item.name;

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
      {canRedo && item.status === ItemStatus.DELIVERED && (
        <button
          type="button"
          className="order-ticket__button-secondary"
          aria-label={`Rehacer ${item.name}`}
          disabled={isMutating}
          onClick={() => onRedoItem(item)}
        >
          Rehacer
        </button>
      )}
    </li>
  );
}

interface OrderItemsListProps {
  readonly items: readonly OrderItem[];
  readonly isEditing: boolean;
  readonly isMutating: boolean;
  readonly canRedo: boolean;
  readonly draftItems: readonly EditableOrderItem[];
  readonly onUpdateDraftItem: (index: number, update: Partial<EditableOrderItem>) => void;
  readonly onRemoveDraftItem: (index: number) => void;
  readonly onRedoItem: (item: OrderItem) => void;
  readonly onOpenAddDish: () => void;
}

function OrderItemsList({
  items,
  isEditing,
  isMutating,
  canRedo,
  draftItems,
  onUpdateDraftItem,
  onRemoveDraftItem,
  onRedoItem,
  onOpenAddDish,
}: Readonly<OrderItemsListProps>) {
  if (isEditing) {
    return (
      <div className="order-ticket__items">
        <h3>Platillos</h3>
        {draftItems.length === 0 ? (
          <p>Esta comanda todavía no tiene platillos.</p>
        ) : (
          <ul>
            {draftItems.map((draft, index) => (
              <EditableItemRow
                key={draft.id ?? draft.itemId ?? `${draft.name}-${index}`}
                draft={draft}
                index={index}
                isMutating={isMutating}
                canRemove={draftItems.length > 1}
                onUpdate={onUpdateDraftItem}
                onRemove={onRemoveDraftItem}
              />
            ))}
          </ul>
        )}
        <div className="order-ticket__add-item-container">
          <button
            type="button"
            className="order-ticket__add-item-btn"
            data-testid="order-ticket-add-dish-btn"
            disabled={isMutating}
            onClick={onOpenAddDish}
          >
            + Agregar platillo
          </button>
        </div>
      </div>
    );
  }

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
        {items.map((item) => (
          <ReadOnlyItemRow
            key={item.id ?? item.itemId ?? item.name}
            item={item}
            isMutating={isMutating}
            canRedo={canRedo}
            onRedoItem={onRedoItem}
          />
        ))}
      </ul>
    </div>
  );
}

interface OrderTicketExistingActionsProps {
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

function OrderTicketExistingActions({
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
}: Readonly<OrderTicketExistingActionsProps>) {
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

interface OrderTicketDraftActionsProps {
  readonly isMutating: boolean;
  readonly isCreating: boolean;
  readonly hasDraftItems: boolean;
  readonly onConfirmCreate: () => void;
  readonly onSaveDraft: () => void;
  readonly onDiscard: () => void;
}

function OrderTicketDraftActions({
  isMutating,
  isCreating,
  hasDraftItems,
  onConfirmCreate,
  onSaveDraft,
  onDiscard,
}: Readonly<OrderTicketDraftActionsProps>) {
  return (
    <footer className="order-ticket__actions">
      <button
        type="button"
        data-testid="order-ticket-create-confirm-btn"
        disabled={!hasDraftItems || isMutating}
        onClick={onConfirmCreate}
      >
        {isCreating ? 'Enviando…' : 'Enviar a Cocina'}
      </button>
      <button
        type="button"
        className="order-ticket__button-secondary"
        data-testid="order-ticket-create-draft-btn"
        disabled={!hasDraftItems || isMutating}
        onClick={onSaveDraft}
      >
        Guardar borrador
      </button>
      <button
        type="button"
        className="order-ticket__button-secondary"
        data-testid="order-ticket-discard-btn"
        disabled={isMutating}
        onClick={onDiscard}
      >
        Descartar
      </button>
    </footer>
  );
}

function OrderTicket({
  orderId: initialOrderId,
  tableNumber: initialTableNumber,
  isTakeaway: initialIsTakeaway,
  userId,
  waiterId,
  tokenProvider,
  onCreateNewOrder,
  onOrderCreated,
  onOrderSubmitted,
  onOrderCancelled,
  apiBaseUrl,
  webSocketBaseUrl,
  diningSessionId: propDiningSessionId,
  fetchFn,
  WebSocketClass,
}: Readonly<OrderTicketWidgetProps>) {
  const [activeOrderId, setActiveOrderId] = useState<string | undefined>(
    initialOrderId || undefined,
  );
  const isDraftMode = !activeOrderId;

  const [draftTableNumber, setDraftTableNumber] = useState<number | string>(
    initialTableNumber ?? 1,
  );
  const [draftIsTakeaway, setDraftIsTakeaway] = useState<boolean>(
    Boolean(initialIsTakeaway),
  );
  const [isEditing, setIsEditing] = useState(isDraftMode);
  const [draftItems, setDraftItems] = useState<EditableOrderItem[]>([]);
  const [selectedRedoItem, setSelectedRedoItem] = useState<OrderItem | null>(null);
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [selectedDishForDialog, setSelectedDishForDialog] = useState<SelectedDishInfo | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const actionLock = useRef(false);

  const client = useQueryClient();
  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, tokenProvider, fetchFn }),
    [apiBaseUrl, tokenProvider, fetchFn],
  );

  const queryKey = useMemo(
    () => [...ORDER_QUERY_PREFIX, activeOrderId ?? 'draft'],
    [activeOrderId],
  );
  const effectiveUserId = userId || waiterId || 'waiter-default';
  const channels = useMemo(
    () => ['floor', `user:${effectiveUserId}`],
    [effectiveUserId],
  );

  const orderQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}`,
        OrderSchema,
      ),
    enabled: Boolean(activeOrderId),
  });

  const order = orderQuery.data;

  // Listen to external fmat:comanda:add-item and fmat:comanda:open-add-dialog DOM events
  useEffect(() => {
    const handleAddItemEvent = (event: Event) => {
      const customEvent = event as CustomEvent<AddItemEventDetail>;
      const detail = customEvent.detail;
      if (!detail?.name) return;

      const newItem: EditableOrderItem = {
        dishId: detail.dishId,
        itemId: detail.itemId,
        name: detail.name,
        quantity:
          typeof detail.quantity === 'number' && detail.quantity > 0
            ? detail.quantity
            : 1,
        modifiers: Array.isArray(detail.modifiers) ? detail.modifiers : [],
        notes: typeof detail.notes === 'string' ? detail.notes : '',
      };

      setDraftItems((prevItems) => {
        let base = prevItems;
        if (!isEditing && order) {
          base = toEditableItems(order.items);
        }
        return mergeDraftItem(base, newItem);
      });
      setIsEditing(true);
    };

    const handleOpenAddDialogEvent = (event: Event) => {
      const customEvent = event as CustomEvent<SelectedDishInfo>;
      const detail = customEvent.detail;
      if (!detail?.name) return;

      setSelectedDishForDialog({
        dishId: detail.dishId,
        itemId: detail.itemId,
        name: detail.name,
        unitPrice: detail.unitPrice,
      });
      setIsAddDishOpen(true);
    };

    window.addEventListener('fmat:comanda:add-item', handleAddItemEvent);
    window.addEventListener('fmat:comanda:open-add-dialog', handleOpenAddDialogEvent);
    return () => {
      window.removeEventListener('fmat:comanda:add-item', handleAddItemEvent);
      window.removeEventListener('fmat:comanda:open-add-dialog', handleOpenAddDialogEvent);
    };
  }, [isEditing, order]);

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
    onSettled: () => {
      actionLock.current = false;
    },
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
    onSettled: () => {
      actionLock.current = false;
    },
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
    onSettled: () => {
      actionLock.current = false;
    },
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch<Order>(
        `/orders/${encodeURIComponent(activeOrderId!)}/items`,
        {
          items: draftItems.map((item) => ({
            id: item.id,
            itemId: item.itemId,
            dishId: item.dishId ?? undefined,
            name: item.name,
            quantity:
              typeof item.quantity === 'number'
                ? item.quantity
                : Number(item.quantity) || 1,
            modifiers: item.modifiers,
            notes: item.notes,
          })),
        },
        OrderSchema,
      ),
    onSuccess: (updated) => {
      client.setQueryData(queryKey, updated);
      setIsEditing(false);
    },
    onSettled: () => {
      actionLock.current = false;
    },
  });

  const handleOrderStatusChanged = (event: OrderStatusChangedEvent) => {
    if (!activeOrderId || event.orderId !== activeOrderId) {
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
    WebSocketClass,
    onOrderStatusChanged: handleOrderStatusChanged,
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

  const handleAddDish = (dish: NewDishData) => {
    const newItem: EditableOrderItem = {
      dishId: dish.dishId,
      itemId: dish.itemId,
      name: dish.name,
      quantity: dish.quantity,
      modifiers: dish.modifiers,
      notes: dish.notes,
    };
    setDraftItems((prev) => {
      let base = prev;
      if (!isEditing && order) {
        base = toEditableItems(order.items);
      }
      return mergeDraftItem(base, newItem);
    });
    setIsEditing(true);
    setSelectedDishForDialog(null);
  };

  const startEditing = () => {
    if (order) {
      setDraftItems(toEditableItems(order.items));
    }
    setIsEditing(true);
  };

  const hasQuantityFormatErrors = draftItems.some(
    (item) =>
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1,
  );

  const hasInvalidQuantities = draftItems.length === 0 || hasQuantityFormatErrors;

  const submitEdits = () => {
    if (hasInvalidQuantities) {
      return;
    }
    runMutation(() => editMutation.mutate());
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

  const effectiveDiningSessionId = order?.diningSessionId || propDiningSessionId;

  const handleCreateOrder = async (confirm: boolean) => {
    if (hasInvalidQuantities || actionLock.current || isMutating || isCreating) {
      return;
    }
    actionLock.current = true;
    setIsCreating(true);
    setCreateError(null);

    try {
      const tableNum = parseTableNumber(draftIsTakeaway, draftTableNumber);

      const created = await api.post<Order>(
        '/orders',
        {
          tableNumber: tableNum,
          isTakeaway: draftIsTakeaway,
          diningSessionId: effectiveDiningSessionId,
        },
        OrderSchema,
      );

      const createdId = created.id ?? created.orderId ?? created.publicId;
      if (!createdId) {
        throw new Error('No se pudo obtener el identificador de la comanda creada.');
      }

      const withItems = await api.patch<Order>(
        `/orders/${encodeURIComponent(createdId)}/items`,
        {
          items: draftItems.map((item) => ({
            id: item.id,
            itemId: item.itemId,
            dishId: item.dishId ?? undefined,
            name: item.name,
            quantity:
              typeof item.quantity === 'number'
                ? item.quantity
                : Number(item.quantity) || 1,
            modifiers: item.modifiers,
            notes: item.notes,
          })),
        },
        OrderSchema,
      );

      let finalOrder = withItems;
      if (confirm) {
        finalOrder = await api.post<Order>(
          `/orders/${encodeURIComponent(createdId)}/confirm`,
          undefined,
          OrderSchema,
        );
      }

      setActiveOrderId(createdId);
      setIsEditing(false);
      client.setQueryData([...ORDER_QUERY_PREFIX, createdId], {
        ...finalOrder,
        awaitingStockConfirmation:
          confirm && finalOrder.status === OrderStatus.CREATED,
      });
      onOrderCreated?.(finalOrder);
      if (confirm) {
        onOrderSubmitted?.(createdId);
      }
    } catch (err) {
      setCreateError(getDisplayError(err));
    } finally {
      actionLock.current = false;
      setIsCreating(false);
    }
  };

  const handleDiscard = () => {
    if (isDraftMode) {
      setDraftItems([]);
      onCreateNewOrder?.();
    } else {
      setIsEditing(false);
    }
  };

  if (activeOrderId && orderQuery.isPending) {
    return (
      <section className="order-ticket" aria-busy="true">
        <output>Cargando comanda…</output>
      </section>
    );
  }

  if (activeOrderId && orderQuery.isError) {
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

  const isCreated = order?.status === OrderStatus.CREATED;
  const isReserved = order?.status === OrderStatus.RESERVED;
  const isRejected = order?.status === OrderStatus.REJECTED;

  const canCancel = Boolean(isCreated || isReserved || isRejected);
  const canEdit = Boolean((isCreated && !order?.confirmedAt) || isRejected);
  const canConfirm = Boolean(isCreated && !order?.confirmedAt);

  const rejectionDetailsParsed = order ? parseRejectionDetails(order.rejectionDetails) : null;
  const alertMessage = order ? getOrderAlert(order.status) : '';
  const connectionMessage = getRealtimeStatusMessage(
    WEBSOCKET_STATUS_TRANSLATIONS[connectionStatus],
  );

  return (
    <section className="order-ticket" aria-labelledby="order-ticket-title">
      {order && activeOrderId ? (
        <OrderExistingHeader
          order={order}
          orderId={activeOrderId}
          diningSessionId={propDiningSessionId}
        />
      ) : (
        <OrderDraftHeader
          draftTableNumber={draftTableNumber}
          draftIsTakeaway={draftIsTakeaway}
          isMutating={isMutating}
          diningSessionId={effectiveDiningSessionId}
          onTableNumberChange={setDraftTableNumber}
          onTakeawayChange={setDraftIsTakeaway}
        />
      )}

      {order?.awaitingStockConfirmation && (
        <output className="order-ticket__stock-status">
          Pendiente de confirmación de inventario
        </output>
      )}

      <output className="order-ticket__connection" aria-live="polite">
        {connectionMessage}
      </output>

      {alertMessage && (
        <div className="order-ticket__alert" role="status" aria-live="assertive">
          <p>{alertMessage}</p>
          {order?.status === OrderStatus.EXPIRED && (
            <button type="button" onClick={onCreateNewOrder}>
              Crear una nueva comanda
            </button>
          )}
        </div>
      )}

      {isRejected && rejectionDetailsParsed && order && (
        <RejectionBreakdown details={rejectionDetailsParsed} orderItems={order.items} />
      )}

      <OrderItemsList
        items={order?.items ?? []}
        isEditing={isEditing}
        isMutating={isMutating}
        canRedo={order?.status === OrderStatus.DELIVERED}
        draftItems={draftItems}
        onUpdateDraftItem={updateDraftItem}
        onRemoveDraftItem={removeDraftItem}
        onRedoItem={setSelectedRedoItem}
        onOpenAddDish={() => setIsAddDishOpen(true)}
      />

      {createError && (
        <p className="order-ticket__error" role="alert">
          {createError}
        </p>
      )}
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
      {isEditing && hasQuantityFormatErrors && (
        <p className="order-ticket__error" role="alert">
          La cantidad de cada platillo debe ser un entero mayor que cero.
        </p>
      )}

      {isDraftMode ? (
        <OrderTicketDraftActions
          isMutating={isMutating}
          isCreating={isCreating}
          hasDraftItems={draftItems.length > 0 && !hasQuantityFormatErrors}
          onConfirmCreate={() => handleCreateOrder(true)}
          onSaveDraft={() => handleCreateOrder(false)}
          onDiscard={handleDiscard}
        />
      ) : (
        <OrderTicketExistingActions
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
          onDiscardEdits={handleDiscard}
        />
      )}

      {selectedRedoItem && (
        <RedoItemDialog
          itemName={selectedRedoItem.name}
          isPending={redoMutation.isPending}
          onClose={() => {
            if (!redoMutation.isPending) setSelectedRedoItem(null);
          }}
          onSubmit={(note) => submitRedo(selectedRedoItem, note)}
        />
      )}

      <AddDishDialog
        isOpen={isAddDishOpen}
        isPending={isMutating}
        dish={selectedDishForDialog}
        onClose={() => {
          setIsAddDishOpen(false);
          setSelectedDishForDialog(null);
        }}
        onAdd={handleAddDish}
      />
    </section>
  );
}

export default function OrderTicketWidget(props: Readonly<OrderTicketWidgetProps>) {
  return (
    <div className="orders-kds-root">
      <QueryClientProvider client={queryClient}>
        <OrderTicket key={props.orderId ?? 'draft'} {...props} />
      </QueryClientProvider>
    </div>
  );
}
