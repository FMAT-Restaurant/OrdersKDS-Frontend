/**
 * @file Presentational header, error banner, rejection breakdown, and footer actions for OrderTicketWidget.
 * @satisfies RF-12, RF-13, RF-14, RF-15, RF-17, RF-23
 */

import { useState } from 'react';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import { getOrderNumberDisplay } from '../kds-board/orderNumberDisplay.ts';
import {
  ORDER_STATUS_LABELS,
  formatIngredientName,
  formatSessionDisplay,
  getTableOrTakeawayLabel,
  resolveDishName,
  type ParsedRedoRejection,
  type ParsedRejectionDetails,
  type TableOrderGroup,
} from './orderTicketUtils.ts';

/** Keyed UI alert banner entry. */
export interface TicketErrorItem {
  readonly id: string;
  readonly message: string;
}

/** Props for rendering non-empty validation/API error banners. */
export interface OrderTicketErrorListProps {
  readonly errors: readonly TicketErrorItem[];
}

/** Renders accessible alert messages for ticket mutations and validation errors. */
export function OrderTicketErrorList({ errors }: Readonly<OrderTicketErrorListProps>) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <>
      {errors.map((err) => (
        <p className="order-ticket__error" role="alert" key={err.id}>
          {err.message}
        </p>
      ))}
    </>
  );
}

/** Props for RejectionBreakdown. */
export interface RejectionBreakdownProps {
  readonly details: ParsedRejectionDetails;
  readonly orderItems: readonly OrderItem[];
}

/** Displays granular missing ingredients and item-level rejection breakdown from inventory. */
export function RejectionBreakdown({ details, orderItems }: Readonly<RejectionBreakdownProps>) {
  return (
    <div className="order-ticket__rejection-breakdown">
      <h3>Detalle de rechazo de inventario</h3>
      {details.reason && (
        <p className="order-ticket__rejection-reason" data-testid="rejection-reason-banner">
          <strong>Motivo:</strong> {details.reason}
        </p>
      )}
      {details.missingIngredients && details.missingIngredients.length > 0 && (
        <p className="order-ticket__missing-ingredients">
          <strong>Ingredientes faltantes:</strong>{' '}
          {details.missingIngredients
            .map((ingredient) => formatIngredientName(ingredient))
            .join(', ')}
        </p>
      )}
      {details.rejectedItems.length > 0 && (
        <div className="order-ticket__rejected-list">
          <h4>Platillos no disponibles</h4>
          <ul>
            {details.rejectedItems.map((item, idx) => {
              const dishName =
                item.name ??
                item.itemName ??
                resolveDishName(item.dishId ?? item.offerId, orderItems);
              const formattedReason = item.reason
                ? item.reason.replaceAll(/stock/gi, 'inventario')
                : undefined;
              const itemKey = `${item.offerId ?? item.itemId ?? item.dishId ?? dishName}-${idx}`;
              return (
                <li key={itemKey}>
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
              const reservedKey = `${item.offerId ?? item.dishId ?? dishName}-${idx}`;
              return (
                <li key={reservedKey}>
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

/** Props for RedoRejectionBanner. */
export interface RedoRejectionBannerProps {
  readonly rejection: ParsedRedoRejection;
  readonly orderItems: readonly OrderItem[];
}

/** Displays asynchronous inventory rejection notice when a dish redo could not be fulfilled. */
export function RedoRejectionBanner({
  rejection,
  orderItems,
}: Readonly<RedoRejectionBannerProps>) {
  const dishName = rejection.itemName ?? resolveDishName(rejection.itemId, orderItems);
  return (
    <div
      className="order-ticket__alert order-ticket__redo-rejection"
      role="alert"
      data-testid="redo-rejection-banner"
    >
      <p>
        No se pudo rehacer <strong>{dishName}</strong>: inventario insuficiente.
      </p>
      {rejection.reason && (
        <p className="order-ticket__rejection-reason">
          <strong>Motivo:</strong> {rejection.reason}
        </p>
      )}
      {rejection.missingIngredients.length > 0 && (
        <p className="order-ticket__missing-ingredients">
          <strong>Ingredientes faltantes:</strong>{' '}
          {rejection.missingIngredients
            .map((ingredient) => formatIngredientName(ingredient))
            .join(', ')}
        </p>
      )}
    </div>
  );
}

/** Props for OrderDraftHeader. */
export interface OrderDraftHeaderProps {
  readonly draftTableNumber: number | string;
  readonly draftIsTakeaway: boolean;
  readonly isTableLocked?: boolean;
  readonly isMutating: boolean;
  readonly diningSessionId?: string;
  readonly entityNoun?: string;
  readonly onTableNumberChange: (table: number | string) => void;
  readonly onTakeawayChange: (takeaway: boolean) => void;
  readonly onUnlockTable?: () => void;
}

/** Header for creating a new draft order/comanda with table and takeaway controls. */
export function OrderDraftHeader({
  draftTableNumber,
  draftIsTakeaway,
  isTableLocked = false,
  isMutating,
  diningSessionId,
  entityNoun = 'Orden',
  onTableNumberChange,
  onTakeawayChange,
  onUnlockTable,
}: Readonly<OrderDraftHeaderProps>) {
  return (
    <header className="order-ticket__header">
      <div>
        <h2 id="order-ticket-title">{`Nueva ${entityNoun}`}</h2>
        <div className="order-ticket__draft-table-controls">
          <label>
            <input
              type="checkbox"
              data-testid="draft-takeaway-checkbox"
              checked={draftIsTakeaway}
              disabled={isMutating || isTableLocked}
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
                disabled={isMutating || isTableLocked}
                readOnly={isTableLocked}
                onChange={(e) => {
                  const val = e.target.value;
                  onTableNumberChange(val === '' ? '' : Number.parseInt(val, 10) || 1);
                }}
              />
            </label>
          )}
          {isTableLocked && onUnlockTable && (
            <button
              type="button"
              className="order-ticket__chip"
              data-testid="draft-unlock-table-btn"
              disabled={isMutating}
              onClick={onUnlockTable}
            >
              Otra mesa
            </button>
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

/** Props for OrderExistingHeader. */
export interface OrderExistingHeaderProps {
  readonly order: Order;
  readonly orderId: string;
  readonly diningSessionId?: string;
  readonly entityNoun?: string;
}

/** Header for an existing persisted order/comanda with table, session, and status badge. */
export function OrderExistingHeader({
  order,
  orderId,
  diningSessionId,
  entityNoun = 'Orden',
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
        <h2 id="order-ticket-title">{`${entityNoun} #${orderNumber}`}</h2>
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

/** Props for WaiterActiveOrdersByTable. */
export interface WaiterActiveOrdersByTableProps {
  readonly groups: readonly TableOrderGroup[];
  readonly activeOrderId?: string;
  readonly isDraftMode: boolean;
  readonly onSelectOrder: (orderId: string) => void;
  readonly onStartOrderForTable: (tableNumber: number | null, isTakeaway: boolean) => void;
}

/** Groups active waiter shift orders by table so the waiter can switch orders or start new ones. */
export function WaiterActiveOrdersByTable({
  groups,
  activeOrderId,
  isDraftMode,
  onSelectOrder,
  onStartOrderForTable,
}: Readonly<WaiterActiveOrdersByTableProps>) {
  const totalOrders = groups.reduce((acc, g) => acc + g.orders.length, 0);
  const [manualToggle, setManualToggle] = useState(false);

  if (totalOrders === 0) {
    return null;
  }

  const isExpanded = totalOrders > 1 || isDraftMode || manualToggle;

  if (!isExpanded) {
    return (
      <div className="order-ticket__table-groups-collapsed">
        <button
          type="button"
          className="order-ticket__chip"
          data-testid="toggle-table-orders-panel-btn"
          onClick={() => setManualToggle(true)}
        >
          Ver órdenes activas por mesa ({totalOrders})
        </button>
      </div>
    );
  }

  return (
    <section
      className="order-ticket__table-groups"
      aria-label="Órdenes activas del turno agrupadas por mesa"
      data-testid="waiter-table-orders-panel"
    >
      <div className="order-ticket__table-groups-header">
        <strong>Órdenes activas por mesa ({totalOrders})</strong>
        {totalOrders === 1 && !isDraftMode && (
          <button
            type="button"
            className="order-ticket__chip"
            onClick={() => setManualToggle(false)}
          >
            Ocultar
          </button>
        )}
      </div>
      <div className="order-ticket__table-group-list">
        {groups.map((group) => (
          <div
            key={group.groupKey}
            className="order-ticket__table-group"
            data-testid={
              group.isTakeaway ? 'table-group-takeaway' : `table-group-${group.tableNumber ?? 'none'}`
            }
          >
            <div className="order-ticket__table-group-title">
              <span>{group.label}</span>
              <button
                type="button"
                className="order-ticket__chip order-ticket__chip--add-order"
                data-testid={`new-order-for-${group.groupKey}`}
                onClick={() => onStartOrderForTable(group.tableNumber, group.isTakeaway)}
              >
                Agregar Orden
              </button>
            </div>
            <div className="order-ticket__table-order-chips">
              {group.orders.map((ord) => {
                const ordId = ord.id ?? ord.orderId ?? ord.publicId ?? '';
                const numDisplay = getOrderNumberDisplay(ord.orderNumber, ordId);
                const isSelected = Boolean(activeOrderId && ordId === activeOrderId);
                return (
                  <button
                    key={ordId}
                    type="button"
                    data-testid={`table-order-chip-${ordId}`}
                    data-active={isSelected ? 'true' : 'false'}
                    className="order-ticket__table-order-chip"
                    onClick={() => onSelectOrder(ordId)}
                  >
                    <span>#{numDisplay}</span>
                    <span> · {ORDER_STATUS_LABELS[ord.status]}</span>
                    <span> ({ord.items.length})</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Props for OrderTicketExistingActions. */
export interface OrderTicketExistingActionsProps {
  readonly isEditing: boolean;
  readonly isMutating: boolean;
  readonly isEditPending: boolean;
  readonly isConfirmPending: boolean;
  readonly isCancelPending: boolean;
  readonly isRequestBillPending?: boolean;
  readonly canConfirm: boolean;
  readonly canCancel: boolean;
  readonly canEdit: boolean;
  readonly canRequestBill?: boolean;
  readonly canResetToNew?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onStartEditing: () => void;
  readonly onSubmitEdits: () => void;
  readonly onDiscardEdits: () => void;
  readonly onRequestBill?: () => void;
  readonly onResetToNew?: () => void;
  readonly onAddNewOrder?: () => void;
}

/** Footer action buttons for existing orders in read-only or edit mode. */
export function OrderTicketExistingActions({
  isEditing,
  isMutating,
  isEditPending,
  isConfirmPending,
  isCancelPending,
  isRequestBillPending = false,
  canConfirm,
  canCancel,
  canEdit,
  canRequestBill = false,
  canResetToNew,
  onConfirm,
  onCancel,
  onStartEditing,
  onSubmitEdits,
  onDiscardEdits,
  onRequestBill,
  onResetToNew,
  onAddNewOrder,
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
    <>
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
        {canRequestBill && onRequestBill && (
          <button
            type="button"
            data-testid="order-ticket-request-bill-btn"
            className="order-ticket__button-secondary"
            onClick={onRequestBill}
            disabled={isMutating}
          >
            {isRequestBillPending ? 'Solicitando cuenta…' : 'Solicitar cuenta'}
          </button>
        )}
        {canResetToNew && onResetToNew && (
          <button
            type="button"
            className="order-ticket__button-secondary"
            onClick={onResetToNew}
            disabled={isMutating}
          >
            Nueva orden
          </button>
        )}
      </footer>
      {onAddNewOrder && (
        <div className="order-ticket__add-order-row">
          <button
            type="button"
            className="order-ticket__add-item-btn order-ticket__add-order-btn"
            data-testid="order-ticket-add-new-order-btn"
            aria-label="Agregar nueva Orden"
            disabled={isMutating}
            onClick={onAddNewOrder}
          >
            + Agregar nueva Orden
          </button>
        </div>
      )}
    </>
  );
}

/** Props for OrderTicketDraftActions. */
export interface OrderTicketDraftActionsProps {
  readonly isMutating: boolean;
  readonly isCreating: boolean;
  readonly hasDraftItems: boolean;
  readonly onConfirmCreate: () => void;
  readonly onSaveDraft: () => void;
  readonly onDiscard: () => void;
}

/** Footer action buttons for unsaved draft orders. */
export function OrderTicketDraftActions({
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
