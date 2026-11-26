/**
 * @file Federated waiter/ticket orchestrator widget for creating, editing, and confirming orders.
 * @satisfies RF-12, RF-13, RF-14, RF-15, RF-17, RF-22, RF-23, RNF-03
 */

import { useEffect, useMemo, useState } from 'react';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from './shared/api/zodCsp.ts';
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
  RedoRejectionBanner,
  RejectionBreakdown,
  WaiterActiveOrdersByTable,
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
  groupActiveOrdersByTable,
  hasInvalidDraftItemQuantity,
  parseRedoRejection,
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
  readonly orders?: readonly Order[];
  readonly tableNumber?: number | string;
  readonly isTakeaway?: boolean;
  readonly userId?: string;
  readonly waiterId?: string;
  readonly tokenProvider?: TokenProvider;
  readonly token?: string;
  readonly onCreateNewOrder?: () => void;
  readonly onSelectOrder?: (orderId: string) => void;
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

const OrderListSchema = z.array(OrderSchema);

function createEffectiveTokenProvider(
  tokenProvider: TokenProvider | undefined,
  token: string | undefined,
): TokenProvider {
  return tokenProvider ?? (() => Promise.resolve(token ?? getStoredSessionToken()));
}

function recordOrderInMap(
  prev: Record<string, Order>,
  candidate: Order | undefined,
): Record<string, Order> {
  if (!candidate) {
    return prev;
  }
  const id = candidate.id ?? candidate.orderId ?? candidate.publicId;
  return id ? { ...prev, [id]: candidate } : prev;
}

function applyDraftItemUpdate(
  items: EditableOrderItem[],
  index: number,
  update: Partial<EditableOrderItem>,
): EditableOrderItem[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item));
}

function appendDishToDraft(
  context: { readonly isEditing: boolean; readonly order: Order | undefined },
  current: EditableOrderItem[],
  dish: NewDishData,
): EditableOrderItem[] {
  const base = !context.isEditing && context.order ? toEditableItems(context.order.items) : current;
  return mergeDraftItem(base, createEditableOrderItem(dish));
}

function resolveVisibleBillFeedback(
  billFeedback: { readonly orderId?: string; readonly message: string } | null,
  activeOrderId: string | undefined,
): string | null {
  return billFeedback && billFeedback.orderId === activeOrderId ? billFeedback.message : null;
}

function extractMutationError(mutation: { isError: boolean; error: unknown }): unknown {
  return mutation.isError ? mutation.error : null;
}

function logOrderQueryErrorIfFailed(
  queryState: { readonly isError: boolean; readonly error: unknown },
  activeOrderId: string | undefined,
): void {
  if (queryState.isError && queryState.error && activeOrderId) {
    logDeveloperError('OrderTicket', `/orders/${activeOrderId}`, queryState.error);
  }
}

function syncOrderStatusFromEvent(
  activeOrderId: string | undefined,
  client: ReturnType<typeof useQueryClient>,
  queryKey: readonly string[],
  event: Parameters<typeof applyRealtimeStatusChange>[1],
): void {
  if (activeOrderId && event.orderId === activeOrderId) {
    client.setQueryData<Order>(queryKey, (currentOrder) =>
      applyRealtimeStatusChange(currentOrder, event),
    );
  }
}

function applyTableSelectionToDraft(
  selection: { readonly tableNumber: number | null; readonly isTakeaway: boolean },
  setDraftIsTakeaway: (takeaway: boolean) => void,
  setDraftTableNumber: (table: number | string) => void,
): void {
  setDraftIsTakeaway(selection.isTakeaway);
  if (!selection.isTakeaway && selection.tableNumber !== null) {
    setDraftTableNumber(selection.tableNumber);
  }
}

function OrderTicketAlertBanner({
  alertMessage,
  showTerminalResetButton,
  entityNounLower,
  onResetToNewOrder,
}: Readonly<{
  alertMessage: string;
  showTerminalResetButton: boolean;
  entityNounLower: string;
  onResetToNewOrder: () => void;
}>) {
  if (!alertMessage) {
    return null;
  }
  return (
    <div className="order-ticket__alert" role="status" aria-live="assertive">
      <p>{alertMessage}</p>
      {showTerminalResetButton && (
        <button
          type="button"
          className="order-ticket__button-secondary"
          onClick={onResetToNewOrder}
        >
          Crear una nueva {entityNounLower}
        </button>
      )}
    </div>
  );
}

function OrderTicketHeaderSwitch({
  order,
  activeOrderId,
  propDiningSessionId,
  effectiveDiningSessionId,
  entityNoun,
  draftTableNumber,
  draftIsTakeaway,
  isTableLocked,
  isMutating,
  onTableNumberChange,
  onTakeawayChange,
  onUnlockTable,
}: Readonly<{
  order: Order | undefined;
  activeOrderId: string | undefined;
  propDiningSessionId: string | undefined;
  effectiveDiningSessionId: string | undefined;
  entityNoun: string;
  draftTableNumber: number | string;
  draftIsTakeaway: boolean;
  isTableLocked: boolean;
  isMutating: boolean;
  onTableNumberChange: (table: number | string) => void;
  onTakeawayChange: (takeaway: boolean) => void;
  onUnlockTable: () => void;
}>) {
  if (order && activeOrderId) {
    return (
      <OrderExistingHeader
        order={order}
        orderId={activeOrderId}
        diningSessionId={propDiningSessionId}
        entityNoun={entityNoun}
      />
    );
  }
  return (
    <OrderDraftHeader
      draftTableNumber={draftTableNumber}
      draftIsTakeaway={draftIsTakeaway}
      isTableLocked={isTableLocked}
      isMutating={isMutating}
      diningSessionId={effectiveDiningSessionId}
      entityNoun={entityNoun}
      onTableNumberChange={onTableNumberChange}
      onTakeawayChange={onTakeawayChange}
      onUnlockTable={onUnlockTable}
    />
  );
}

function OrderTicketDialogs({
  selectedRedoItem,
  isRedoPending,
  onCloseRedo,
  onSubmitRedo,
  isAddDishOpen,
  isMutating,
  selectedDishForDialog,
  entityNoun,
  onCloseAddDish,
  onAddDish,
}: Readonly<{
  selectedRedoItem: OrderItem | null;
  isRedoPending: boolean;
  onCloseRedo: () => void;
  onSubmitRedo: (item: OrderItem, note: string) => Promise<void>;
  isAddDishOpen: boolean;
  isMutating: boolean;
  selectedDishForDialog: SelectedDishInfo | null;
  entityNoun: string;
  onCloseAddDish: () => void;
  onAddDish: (dish: NewDishData) => void;
}>) {
  return (
    <>
      {selectedRedoItem && (
        <RedoItemDialog
          itemName={selectedRedoItem.name}
          isPending={isRedoPending}
          onClose={onCloseRedo}
          onSubmit={(note) => onSubmitRedo(selectedRedoItem, note)}
        />
      )}

      <AddDishDialog
        isOpen={isAddDishOpen}
        isPending={isMutating}
        dish={selectedDishForDialog}
        entityNoun={entityNoun}
        onClose={onCloseAddDish}
        onAdd={onAddDish}
      />
    </>
  );
}

function collectActiveTableGroups(
  client: ReturnType<typeof useQueryClient>,
  shiftOrders: readonly Order[] | undefined,
  propOrders: readonly Order[] | undefined,
  trackedOrdersById: Record<string, Order>,
  currentOrder: Order | undefined,
) {
  const cachedSingleOrders = client
    .getQueriesData<Order>({ queryKey: ORDER_QUERY_PREFIX })
    .map(([, data]) => data)
    .filter((entry): entry is Order => Boolean(entry && !Array.isArray(entry) && 'items' in entry));
  const combined: Order[] = [
    ...(shiftOrders ?? []),
    ...(propOrders ?? []),
    ...cachedSingleOrders,
    ...Object.values(trackedOrdersById),
    ...(currentOrder ? [currentOrder] : []),
  ];
  return groupActiveOrdersByTable(combined);
}

function buildTicketErrors(params: {
  createError: string | null;
  confirmError: unknown;
  cancelError: unknown;
  editError: unknown;
  requestBillError: unknown;
  showQuantityError: boolean;
}): TicketErrorItem[] {
  const entries: Array<{ id: string; message: string | null }> = [
    { id: 'create', message: params.createError },
    { id: 'confirm', message: params.confirmError ? getDisplayError(params.confirmError) : null },
    { id: 'cancel', message: params.cancelError ? getDisplayError(params.cancelError) : null },
    { id: 'edit', message: params.editError ? getDisplayError(params.editError) : null },
    {
      id: 'request-bill',
      message: params.requestBillError ? getDisplayError(params.requestBillError) : null,
    },
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
  orders: propOrders,
  tableNumber: initialTableNumber,
  isTakeaway: initialIsTakeaway,
  userId,
  waiterId,
  tokenProvider,
  token,
  onCreateNewOrder,
  onSelectOrder,
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
  const [isDraftTableLocked, setIsDraftTableLocked] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState(isDraftMode);
  const [draftItems, setDraftItems] = useState<EditableOrderItem[]>([]);
  const [selectedRedoItem, setSelectedRedoItem] = useState<OrderItem | null>(null);
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [selectedDishForDialog, setSelectedDishForDialog] = useState<SelectedDishInfo | null>(null);
  const [billFeedback, setBillFeedback] = useState<{
    readonly orderId?: string;
    readonly message: string;
  } | null>(null);
  const [trackedOrdersById, setTrackedOrdersById] = useState<Record<string, Order>>({});

  const client = useQueryClient();
  const effectiveTokenProvider = useMemo<TokenProvider>(
    () => createEffectiveTokenProvider(tokenProvider, token),
    [tokenProvider, token],
  );

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

  const shiftOrdersQuery = useQuery({
    queryKey: [...ORDER_QUERY_PREFIX, 'shift-list'],
    queryFn: () => api.get<Order[]>('/orders', OrderListSchema),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    logOrderQueryErrorIfFailed(
      { isError: orderQuery.isError, error: orderQuery.error },
      activeOrderId,
    );
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
    onOrderStatusChanged: (event) =>
      syncOrderStatusFromEvent(activeOrderId, client, queryKey, event),
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
    onOrderCreated: (created) => {
      setTrackedOrdersById((prev) => recordOrderInMap(prev, created));
      onOrderCreated?.(created);
    },
    onOrderSubmitted,
    onOrderCancelled,
    onBillRequested: () => {
      setBillFeedback({
        orderId: activeOrderId,
        message: 'Cuenta solicitada para la mesa.',
      });
    },
  });

  const updateDraftItem = (index: number, update: Partial<EditableOrderItem>) => {
    setDraftItems((items) => applyDraftItemUpdate(items, index, update));
  };

  const removeDraftItem = (index: number) => {
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAddDish = (dish: NewDishData) => {
    setDraftItems((prev) => appendDishToDraft({ isEditing, order }, prev, dish));
    setIsEditing(true);
    setSelectedDishForDialog(null);
  };

  const resetToBlankDraft = () => {
    actions.clearPendingDraftOrder();
    setActiveOrderId(undefined);
    setDraftItems([]);
    setIsEditing(true);
    setBillFeedback(null);
    onCreateNewOrder?.();
  };

  const handleResetToNewOrder = () => {
    setIsDraftTableLocked(false);
    resetToBlankDraft();
  };

  const handleStartNewOrderForTable = (tableNumber: number | null, isTakeaway: boolean) => {
    applyTableSelectionToDraft(
      { tableNumber, isTakeaway },
      setDraftIsTakeaway,
      setDraftTableNumber,
    );
    setIsDraftTableLocked(true);
    resetToBlankDraft();
  };

  const handleSelectOrderFromGroup = (targetOrderId: string) => {
    setTrackedOrdersById((prev) => recordOrderInMap(prev, order));
    setActiveOrderId(targetOrderId);
    setIsEditing(false);
    setBillFeedback(null);
    onSelectOrder?.(targetOrderId);
  };

  const handleStartEditing = () => {
    setDraftItems(toEditableItems(order?.items ?? []));
    setIsEditing(true);
  };

  const handleCloseRedoDialog = () => {
    setSelectedRedoItem((prev) => (actions.redoMutation.isPending ? prev : null));
  };

  const visibleBillFeedback = resolveVisibleBillFeedback(billFeedback, activeOrderId);

  const tableOrderGroups = useMemo(
    () =>
      collectActiveTableGroups(
        client,
        shiftOrdersQuery.data,
        propOrders,
        trackedOrdersById,
        order,
      ),
    [shiftOrdersQuery.data, propOrders, client, trackedOrdersById, order],
  );

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
  const redoRejectionParsed = order ? parseRedoRejection(order.rejectionDetails) : null;
  const alertMessage = order ? getOrderAlert(order.status, entityNounLower) : '';
  const connectionMessage = getRealtimeStatusMessage(
    WEBSOCKET_STATUS_TRANSLATIONS[connectionStatus],
  );
  const ticketErrors = buildTicketErrors({
    createError: actions.createError,
    confirmError: extractMutationError(actions.confirmMutation),
    cancelError: extractMutationError(actions.cancelMutation),
    editError: extractMutationError(actions.editMutation),
    requestBillError: extractMutationError(actions.requestBillMutation),
    showQuantityError: isEditing && hasQuantityFormatErrors,
  });

  return (
    <section className="order-ticket" aria-labelledby="order-ticket-title">
      <WaiterActiveOrdersByTable
        groups={tableOrderGroups}
        activeOrderId={activeOrderId}
        isDraftMode={isDraftMode}
        onSelectOrder={handleSelectOrderFromGroup}
        onStartOrderForTable={handleStartNewOrderForTable}
      />

      <OrderTicketHeaderSwitch
        order={order}
        activeOrderId={activeOrderId}
        propDiningSessionId={propDiningSessionId}
        effectiveDiningSessionId={effectiveDiningSessionId}
        entityNoun={entityNoun}
        draftTableNumber={draftTableNumber}
        draftIsTakeaway={draftIsTakeaway}
        isTableLocked={isDraftTableLocked && tableOrderGroups.length > 0}
        isMutating={actions.isMutating}
        onTableNumberChange={setDraftTableNumber}
        onTakeawayChange={setDraftIsTakeaway}
        onUnlockTable={() => setIsDraftTableLocked(false)}
      />

      {order?.awaitingStockConfirmation && (
        <output className="order-ticket__stock-status">
          Pendiente de confirmación de inventario
        </output>
      )}

      <output className="order-ticket__connection" aria-live="polite">
        {connectionMessage}
      </output>

      <OrderTicketAlertBanner
        alertMessage={alertMessage}
        showTerminalResetButton={permissions.showTerminalResetButton}
        entityNounLower={entityNounLower}
        onResetToNewOrder={handleResetToNewOrder}
      />

      {permissions.isRejected && rejectionDetailsParsed && order && (
        <RejectionBreakdown details={rejectionDetailsParsed} orderItems={order.items} />
      )}

      {order?.status === OrderStatus.DELIVERED && redoRejectionParsed && (
        <RedoRejectionBanner rejection={redoRejectionParsed} orderItems={order.items} />
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

      {visibleBillFeedback && (
        <output className="order-ticket__stock-status" data-testid="order-ticket-bill-feedback">
          {visibleBillFeedback}
        </output>
      )}

      {isDraftMode ? (
        <OrderTicketDraftActions
          isMutating={actions.isMutating}
          isCreating={actions.isCreating}
          hasDraftItems={draftItems.length > 0 && !hasQuantityFormatErrors}
          onConfirmCreate={() => actions.handleCreateOrder(true, getDisplayError)}
          onSaveDraft={() => actions.handleCreateOrder(false, getDisplayError)}
          onDiscard={() => {
            actions.clearPendingDraftOrder();
            setIsDraftTableLocked(false);
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
          isRequestBillPending={actions.requestBillMutation.isPending}
          canConfirm={permissions.canConfirm}
          canCancel={permissions.canCancel}
          canEdit={permissions.canEdit}
          canRequestBill={permissions.canRequestBill}
          canResetToNew={permissions.canResetToNew}
          onConfirm={() => actions.runMutation(() => actions.confirmMutation.mutate())}
          onCancel={() => actions.runMutation(() => actions.cancelMutation.mutate())}
          onRequestBill={() => actions.runMutation(() => actions.requestBillMutation.mutate())}
          onStartEditing={handleStartEditing}
          onSubmitEdits={actions.submitEdits}
          onDiscardEdits={() => setIsEditing(false)}
          onResetToNew={handleResetToNewOrder}
          onAddNewOrder={handleResetToNewOrder}
        />
      )}

      <OrderTicketDialogs
        selectedRedoItem={selectedRedoItem}
        isRedoPending={actions.redoMutation.isPending}
        onCloseRedo={handleCloseRedoDialog}
        onSubmitRedo={actions.submitRedo}
        isAddDishOpen={isAddDishOpen}
        isMutating={actions.isMutating}
        selectedDishForDialog={selectedDishForDialog}
        entityNoun={entityNoun}
        onCloseAddDish={() => {
          setIsAddDishOpen(false);
          setSelectedDishForDialog(null);
        }}
        onAddDish={handleAddDish}
      />
    </section>
  );
}

/** Root federated entry point wrapping OrderTicket in its shared React Query provider. */
export default function OrderTicketWidget(props: Readonly<OrderTicketWidgetProps>) {
  return (
    <div className="orders-kds-root">
      <QueryClientProvider client={queryClient}>
        <OrderTicket {...props} />
      </QueryClientProvider>
    </div>
  );
}
