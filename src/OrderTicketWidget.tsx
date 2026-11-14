/**
 * @file Federated waiter/ticket orchestrator widget for creating, editing, and confirming orders.
 * @satisfies RF-12, RF-13, RF-14, RF-15, RF-17, RF-22, RF-23, RNF-03
 */

import { useEffect, useMemo, useState } from 'react';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient, getStoredSessionToken } from './shared/api/client.ts';
import { OrderSchema, type Order, type OrderItem } from './shared/api/schemas.ts';
import { queryClient } from './shared/api/queryClient.ts';
import { getRealtimeStatusMessage } from './shared/i18n/translate.ts';
import {
  AddDishDialog,
  type NewDishData,
  type SelectedDishInfo,
} from './features/order-ticket/AddDishDialog.tsx';
import { OrderItemsList } from './features/order-ticket/OrderItemsList.tsx';
import {
  OrderDraftHeader,
  OrderExistingHeader,
  OrderTicketDraftActions,
  OrderTicketErrorList,
  OrderTicketExistingActions,
  RejectionBreakdown,
  type TicketErrorItem,
} from './features/order-ticket/OrderTicketSections.tsx';
import { RedoItemDialog } from './features/order-ticket/RedoItemDialog.tsx';
import {
  mergeDraftItem,
  toEditableItems,
  type EditableOrderItem,
} from './features/order-ticket/draftItemsHelper.ts';
import {
  ORDER_QUERY_PREFIX,
  WEBSOCKET_STATUS_TRANSLATIONS,
  applyRealtimeStatusChange,
  computeOrderActionPermissions,
  createEditableOrderItem,
  getDisplayError,
  getOrderAlert,
  hasInvalidDraftItemQuantity,
  parseRejectionDetails,
  resolveEffectiveUserId,
} from './features/order-ticket/orderTicketUtils.ts';
import { useExternalOrderEvents } from './features/order-ticket/useExternalOrderEvents.ts';
import { useOrderTicketActions } from './features/order-ticket/useOrderTicketActions.ts';
import { useOrderEvents } from './shared/realtime/useOrderEvents.ts';
import { getStoredSessionUser, type TokenProvider } from './shared/types/auth.ts';
import { logDeveloperError } from './shared/api/devErrorLogger.ts';
import { OrderStatus } from './shared/types/order.ts';
import './features/order-ticket/OrderTicketWidget.css';

export type {
  AddItemEventDetail,
  EditableOrderItem,
} from './features/order-ticket/draftItemsHelper.ts';

/** Public federated properties accepted by OrderTicketWidget. */
export interface OrderTicketWidgetProps {
  readonly orderId?: string;
  readonly tableNumber?: number | string;
  readonly isTakeaway?: boolean;
  readonly userId?: string;
  readonly waiterId?: string;
  readonly tokenProvider?: TokenProvider;
  readonly token?: string;
  readonly onCreateNewOrder?: () => void;
  readonly onOrderCreated?: (order: Order) => void;
  readonly onOrderSubmitted?: (orderId: string) => void;
  readonly onOrderCancelled?: () => void;
  readonly apiBaseUrl?: string;
  readonly webSocketBaseUrl?: string;
  readonly diningSessionId?: string;
  readonly entityLabel?: 'comanda' | 'orden';
  readonly allowRemoveAllItems?: boolean;
  readonly fetchFn?: typeof fetch;
  readonly WebSocketClass?: typeof WebSocket;
}

function buildTicketErrors(params: {
  createError: string | null;
  confirmError: unknown;
  cancelError: unknown;
  editError: unknown;
  showQuantityError: boolean;
}): TicketErrorItem[] {
  const entries: Array<{ id: string; message: string | null }> = [
    { id: 'create', message: params.createError },
    { id: 'confirm', message: params.confirmError ? getDisplayError(params.confirmError) : null },
    { id: 'cancel', message: params.cancelError ? getDisplayError(params.cancelError) : null },
    { id: 'edit', message: params.editError ? getDisplayError(params.editError) : null },
    {
      id: 'quantity',
      message: params.showQuantityError
        ? 'La cantidad de cada platillo debe ser un entero mayor que cero.'
        : null,
    },
  ];
  return entries.filter((entry): entry is TicketErrorItem => entry.message !== null);
}

function OrderTicket({
  orderId: initialOrderId,
  tableNumber: initialTableNumber,
  isTakeaway: initialIsTakeaway,
  userId,
  waiterId,
  tokenProvider,
  token,
  onCreateNewOrder,
  onOrderCreated,
  onOrderSubmitted,
  onOrderCancelled,
  apiBaseUrl,
  webSocketBaseUrl,
  diningSessionId: propDiningSessionId,
  entityLabel: entityLabelProp,
  allowRemoveAllItems,
  fetchFn,
  WebSocketClass,
}: Readonly<OrderTicketWidgetProps>) {
  const effectiveEntityLabel = entityLabelProp ?? 'orden';
  const entityNoun = effectiveEntityLabel === 'comanda' ? 'Comanda' : 'Orden';
  const entityNounLower = entityNoun.toLowerCase();

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

  const client = useQueryClient();
  const effectiveTokenProvider = useMemo<TokenProvider>(() => {
    if (tokenProvider) {
      return tokenProvider;
    }
    return () => Promise.resolve(token ?? getStoredSessionToken());
  }, [tokenProvider, token]);

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, tokenProvider: effectiveTokenProvider, fetchFn }),
    [apiBaseUrl, effectiveTokenProvider, fetchFn],
  );
  const queryKey = useMemo(
    () => [...ORDER_QUERY_PREFIX, activeOrderId ?? 'draft'],
    [activeOrderId],
  );
  const effectiveUserId = resolveEffectiveUserId(userId, waiterId, getStoredSessionUser());
  const channels = useMemo(() => ['floor', `user:${effectiveUserId}`], [effectiveUserId]);

  const orderQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Order>(`/orders/${encodeURIComponent(activeOrderId!)}`, OrderSchema),
    enabled: Boolean(activeOrderId),
  });
  const order = orderQuery.data;

  useEffect(() => {
    if (orderQuery.isError && orderQuery.error && activeOrderId) {
      logDeveloperError('OrderTicket', `/orders/${activeOrderId}`, orderQuery.error);
    }
  }, [orderQuery.isError, orderQuery.error, activeOrderId]);

  useExternalOrderEvents({
    isEditing,
    order,
    setDraftItems,
    setIsEditing,
    setSelectedDishForDialog,
    setIsAddDishOpen,
  });

  const { status: connectionStatus } = useOrderEvents({
    role: 'waiter',
    tokenProvider: effectiveTokenProvider,
    channels,
    queryClient: client,
    baseUrl: webSocketBaseUrl,
    WebSocketClass,
    onOrderStatusChanged: (event) => {
      if (activeOrderId && event.orderId === activeOrderId) {
        client.setQueryData<Order>(queryKey, (currentOrder) =>
          applyRealtimeStatusChange(currentOrder, event),
        );
      }
    },
  });

  const hasQuantityFormatErrors = draftItems.some((item) =>
    hasInvalidDraftItemQuantity(item),
  );
  const effectiveDiningSessionId = order?.diningSessionId || propDiningSessionId;

  const actions = useOrderTicketActions({
    api,
    client,
    queryKey,
    activeOrderId,
    draftItems,
    draftTableNumber,
    draftIsTakeaway,
    effectiveDiningSessionId,
    hasInvalidQuantities: draftItems.length === 0 || hasQuantityFormatErrors,
    setActiveOrderId,
    setIsEditing,
    setSelectedRedoItem,
    onOrderCreated,
    onOrderSubmitted,
    onOrderCancelled,
  });

  const updateDraftItem = (index: number, update: Partial<EditableOrderItem>) => {
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
    const newItem = createEditableOrderItem(dish);
    setDraftItems((prev) => {
      const base = !isEditing && order ? toEditableItems(order.items) : prev;
      return mergeDraftItem(base, newItem);
    });
    setIsEditing(true);
    setSelectedDishForDialog(null);
  };

  const handleResetToNewOrder = () => {
    setActiveOrderId(undefined);
    setDraftItems([]);
    setIsEditing(true);
    onCreateNewOrder?.();
  };

  if (activeOrderId && orderQuery.isPending) {
    return (
      <section className="order-ticket" aria-busy="true">
        <output>Cargando {entityNounLower}…</output>
      </section>
    );
  }

  if (activeOrderId && orderQuery.isError) {
    return (
      <section className="order-ticket">
        <p className="order-ticket__error" role="alert">
          {getDisplayError(orderQuery.error)}
        </p>
        <button
          type="button"
          onClick={() => {
            orderQuery.refetch().catch(() => undefined);
          }}
        >
          Reintentar
        </button>
      </section>
    );
  }

  const permissions = computeOrderActionPermissions(order);
  const rejectionDetailsParsed = order ? parseRejectionDetails(order.rejectionDetails) : null;
  const alertMessage = order ? getOrderAlert(order.status, entityNounLower) : '';
  const connectionMessage = getRealtimeStatusMessage(
    WEBSOCKET_STATUS_TRANSLATIONS[connectionStatus],
  );
  const ticketErrors = buildTicketErrors({
    createError: actions.createError,
    confirmError: actions.confirmMutation.isError ? actions.confirmMutation.error : null,
    cancelError: actions.cancelMutation.isError ? actions.cancelMutation.error : null,
    editError: actions.editMutation.isError ? actions.editMutation.error : null,
    showQuantityError: isEditing && hasQuantityFormatErrors,
  });

  return (
    <section className="order-ticket" aria-labelledby="order-ticket-title">
      {order && activeOrderId ? (
        <OrderExistingHeader
          order={order}
          orderId={activeOrderId}
          diningSessionId={propDiningSessionId}
          entityNoun={entityNoun}
        />
      ) : (
        <OrderDraftHeader
          draftTableNumber={draftTableNumber}
          draftIsTakeaway={draftIsTakeaway}
          isMutating={actions.isMutating}
          diningSessionId={effectiveDiningSessionId}
          entityNoun={entityNoun}
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
          {permissions.showTerminalResetButton && (
            <button
              type="button"
              className="order-ticket__button-secondary"
              onClick={handleResetToNewOrder}
            >
              Crear una nueva {entityNounLower}
            </button>
          )}
        </div>
      )}

      {permissions.isRejected && rejectionDetailsParsed && order && (
        <RejectionBreakdown details={rejectionDetailsParsed} orderItems={order.items} />
      )}

      <OrderItemsList
        items={order?.items ?? []}
        isEditing={isEditing}
        isMutating={actions.isMutating}
        canRedo={order?.status === OrderStatus.DELIVERED}
        draftItems={draftItems}
        emptyMessage={`Esta ${entityNounLower} todavía no tiene platillos.`}
        canRemoveItem={Boolean(allowRemoveAllItems || entityLabelProp === 'orden')}
        onUpdateDraftItem={updateDraftItem}
        onRemoveDraftItem={removeDraftItem}
        onRedoItem={setSelectedRedoItem}
        onOpenAddDish={() => setIsAddDishOpen(true)}
      />

      <OrderTicketErrorList errors={ticketErrors} />

      {isDraftMode ? (
        <OrderTicketDraftActions
          isMutating={actions.isMutating}
          isCreating={actions.isCreating}
          hasDraftItems={draftItems.length > 0 && !hasQuantityFormatErrors}
          onConfirmCreate={() => actions.handleCreateOrder(true, getDisplayError)}
          onSaveDraft={() => actions.handleCreateOrder(false, getDisplayError)}
          onDiscard={() => {
            setDraftItems([]);
            onCreateNewOrder?.();
          }}
        />
      ) : (
        <OrderTicketExistingActions
          isEditing={isEditing}
          isMutating={actions.isMutating}
          isEditPending={actions.editMutation.isPending}
          isConfirmPending={actions.confirmMutation.isPending}
          isCancelPending={actions.cancelMutation.isPending}
          canConfirm={permissions.canConfirm}
          canCancel={permissions.canCancel}
          canEdit={permissions.canEdit}
          canResetToNew={permissions.canResetToNew}
          onConfirm={() => actions.runMutation(() => actions.confirmMutation.mutate())}
          onCancel={() => actions.runMutation(() => actions.cancelMutation.mutate())}
          onStartEditing={() => {
            if (order) {
              setDraftItems(toEditableItems(order.items));
            }
            setIsEditing(true);
          }}
          onSubmitEdits={actions.submitEdits}
          onDiscardEdits={() => setIsEditing(false)}
          onResetToNew={handleResetToNewOrder}
        />
      )}

      {selectedRedoItem && (
        <RedoItemDialog
          itemName={selectedRedoItem.name}
          isPending={actions.redoMutation.isPending}
          onClose={() => {
            if (!actions.redoMutation.isPending) {
              setSelectedRedoItem(null);
            }
          }}
          onSubmit={(note) => actions.submitRedo(selectedRedoItem, note)}
        />
      )}

      <AddDishDialog
        isOpen={isAddDishOpen}
        isPending={actions.isMutating}
        dish={selectedDishForDialog}
        entityNoun={entityNoun}
        onClose={() => {
          setIsAddDishOpen(false);
          setSelectedDishForDialog(null);
        }}
        onAdd={handleAddDish}
      />
    </section>
  );
}

/** Root federated entry point wrapping OrderTicket in its shared React Query provider. */
export default function OrderTicketWidget(props: Readonly<OrderTicketWidgetProps>) {
  return (
    <div className="orders-kds-root">
      <QueryClientProvider client={queryClient}>
        <OrderTicket key={props.orderId ?? 'draft'} {...props} />
      </QueryClientProvider>
    </div>
  );
}
