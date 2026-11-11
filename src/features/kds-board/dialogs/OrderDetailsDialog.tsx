/**
 * @file OrderDetailsDialog.tsx
 * @description Modal dialog that displays full order details, modifiers, notes,
 * and allows dish/order actions on top of the KDS grid (TASK-15, TASK-40b, OP-06).
 */

import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Order, OrderItem } from '../../../shared/api/schemas.ts';
import type { UserRole } from '../../../shared/types/auth.ts';
import { StatusBadge } from '../StatusBadge.tsx';
import { useElapsedTime } from '../useElapsedTime.ts';
import { pointerAction } from '../pointerAction.ts';
import { getItemKey, getOrderKey, getOrderNumberDisplay } from '../orderNumberDisplay.ts';
import type { PendingUndoItem } from '../OrderCard.tsx';

export interface OrderDetailsDialogProps {
  readonly order: Order | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onItemReady?: (order: Order, item: OrderItem) => void;
  readonly onUndoItemReady?: (order: Order, item: OrderItem) => void;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
  readonly onUndoOrderReady?: (order: Order) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly userRole?: UserRole;
  readonly pendingAction?: string;
  readonly pendingUndoItem?: PendingUndoItem | null;
  readonly isPendingUndoOrder?: boolean;
  readonly undoOrderSecondsLeft?: number;
  readonly pendingOrderTriggeringItemId?: string;
  readonly optimisticReadyItemIds?: Set<string>;
}

function handleButtonKey(
  event: KeyboardEvent<HTMLButtonElement>,
  action?: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action?.();
  }
}

function getItemRowStyle(
  isRedoPending: boolean,
  isPendingUndo: boolean,
  isFinished: boolean,
): string {
  if (isRedoPending) {
    return 'bg-amber-50/80 border-amber-400';
  }
  if (isPendingUndo) {
    return 'bg-amber-50/70 border-amber-300';
  }
  if (isFinished) {
    return 'bg-emerald-50/40 border-emerald-200';
  }
  return 'bg-white border-border shadow-xs';
}

/**
 * Dish Item Row inside the expanded order details dialog.
 */
function OrderDetailsItemRow({
  order,
  item,
  index,
  onItemReady,
  onUndoItemReady,
  isPending,
  isPendingUndo,
  isOptimisticallyReady,
  undoSecondsLeft = 15,
}: Readonly<{
  order: Order;
  item: OrderItem;
  index: number;
  onItemReady?: (order: Order, item: OrderItem) => void;
  onUndoItemReady?: (order: Order, item: OrderItem) => void;
  isPending: boolean;
  isPendingUndo: boolean;
  isOptimisticallyReady: boolean;
  undoSecondsLeft?: number;
}>) {
  const itemId = getItemKey(item, index);
  const prepTime = item.preparationTimeText ?? item.preparation_time_text ?? null;
  const isFinished =
    item.status === 'READY' ||
    item.status === 'DELIVERED' ||
    Boolean(isOptimisticallyReady);
  const isRedoPending =
    order.status === 'DELIVERED' && item.status === 'PENDING';
  const rowStyle = getItemRowStyle(isRedoPending, isPendingUndo, isFinished);

  return (
    <li
      data-testid={`order-details-item-${itemId}`}
      className={`p-3 sm:p-4 rounded-card border flex flex-col gap-2 transition-all ${rowStyle}`}
    >
      <div className="flex items-center justify-between gap-3 w-full flex-wrap sm:flex-nowrap">
        <div className="flex items-baseline gap-2.5 min-w-0 flex-1 flex-wrap">
          <span
            data-testid={`order-details-item-qty-${itemId}`}
            className="text-lg sm:text-xl font-black text-fmat-primary shrink-0 min-w-[28px]"
          >
            {item.quantity}x
          </span>
          <span
            data-testid={`order-details-item-name-${itemId}`}
            className="text-base sm:text-lg font-bold text-ink leading-snug break-words"
          >
            {item.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {prepTime && (
            <span
              data-testid={`order-details-item-prep-time-${itemId}`}
              className="text-xs font-mono font-semibold text-muted bg-gray-100 border border-border px-2.5 py-1 rounded"
            >
              {prepTime}
            </span>
          )}

          {!isPendingUndo && (
            <button
              type="button"
              data-testid={`order-details-item-action-${itemId}`}
              disabled={isFinished || isPending}
              aria-label={`Marcar ${item.name} como listo`}
              {...pointerAction(() => {
                if (!isFinished) onItemReady?.(order, item);
              })}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !isFinished) {
                  event.preventDefault();
                  onItemReady?.(order, item);
                }
              }}
              style={{ minHeight: 48 }}
              className={`min-h-[48px] px-3.5 py-2 rounded-control text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
                isFinished
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 cursor-default opacity-85'
                  : 'bg-surface hover:bg-emerald-50 active:bg-emerald-100 text-body hover:text-emerald-700 border border-border hover:border-emerald-400 cursor-pointer shadow-sm'
              }`}
            >
              {isFinished ? (
                <>
                  <svg
                    aria-hidden="true"
                    className="w-4 h-4 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>Listo</span>
                </>
              ) : (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-gray-400 inline-block shrink-0" />
                  <span>Marcar listo</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {isPendingUndo && (
        <div
          data-testid={`order-details-item-undo-banner-${itemId}`}
          className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-300"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span
              data-testid={`order-details-item-undo-countdown-${itemId}`}
              className="text-xs sm:text-sm font-bold text-amber-900 leading-tight"
            >
              Listo — pendiente de enviar ({undoSecondsLeft}s)
            </span>
          </div>
          <button
            type="button"
            data-testid={`order-details-item-undo-${itemId}`}
            aria-label={`Deshacer listo para ${item.name}`}
            {...pointerAction(() => onUndoItemReady?.(order, item))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onUndoItemReady?.(order, item);
              }
            }}
            style={{ minWidth: 64, minHeight: 48 }}
            className="min-w-[64px] min-h-[48px] px-4 py-2 rounded-control text-xs sm:text-sm font-extrabold bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 select-none border-0 shrink-0 ml-auto"
          >
            Deshacer
          </button>
        </div>
      )}

      {Boolean(item.modifiers?.length) && (
        <div
          data-testid={`order-details-item-modifiers-${itemId}`}
          className="flex flex-wrap gap-1.5 pl-9 mt-1"
        >
          {item.modifiers?.map((modifier, modIdx) => (
            <span
              key={`${itemId}-mod-${modIdx}`}
              className="inline-block px-2.5 py-1 text-xs font-semibold rounded bg-gray-100 text-body border border-border"
              data-testid={`order-details-item-modifier-${itemId}-${modIdx}`}
            >
              + {modifier}
            </span>
          ))}
        </div>
      )}

      {item.notes && (
        <div
          data-testid={`order-details-item-notes-${itemId}`}
          className="mt-1 pl-9 text-sm text-body italic flex items-start gap-1.5 bg-amber-50/60 p-2 rounded border border-amber-200/80"
        >
          <span className="font-bold not-italic shrink-0 text-amber-900">Nota:</span>
          <span className="break-words text-ink font-medium">{item.notes}</span>
        </div>
      )}

      {isRedoPending && (
        <output
          data-testid={`order-details-redo-pending-${itemId}`}
          className="pl-9 text-xs font-black uppercase tracking-wide text-amber-800 block"
        >
          Rehacer pendiente
        </output>
      )}
    </li>
  );
}

function getOrderStopwatchTiming(order: Order | null) {
  const inPrepAt = order ? (order.in_preparation_at ?? order.inPreparationAt ?? null) : null;
  const stockReservedAt = order ? (order.stock_reserved_at ?? order.stockReservedAt ?? null) : null;
  const isDelivered = order?.status === 'DELIVERED';
  const hasRedoPending =
    isDelivered && Boolean(order?.items.some((item) => item.status === 'PENDING'));
  const isFinished = isDelivered && !hasRedoPending;
  return { inPrepAt, stockReservedAt, isFinished };
}

function getOrderTableDisplay(order: Order): string {
  if (order.tableNumber !== null && order.tableNumber !== undefined) {
    return `Mesa ${order.tableNumber}`;
  }
  if (order.isTakeaway) {
    return 'Para llevar';
  }
  return '';
}

interface OrderDetailsActionsProps {
  readonly order: Order;
  readonly orderNumberDisplay: string;
  readonly pendingAction?: string;
  readonly userRole?: UserRole;
  readonly isPendingUndoOrder?: boolean;
  readonly undoOrderSecondsLeft?: number;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
  readonly onUndoOrderReady?: (order: Order) => void;
  readonly onClose: () => void;
}

function OrderDetailsReservedActions({
  order,
  orderNumberDisplay,
  pendingAction,
  onStartPreparation,
  onRejectSupplies,
  onClose,
}: Readonly<{
  order: Order;
  orderNumberDisplay: string;
  pendingAction?: string;
  onStartPreparation?: (order: Order) => void;
  onRejectSupplies?: (order: Order) => void;
  onClose: () => void;
}>) {
  if (order.status !== 'RESERVED') return null;

  return (
    <>
      <button
        type="button"
        data-testid="order-details-action-start"
        aria-label={`Iniciar preparación para #${orderNumberDisplay}`}
        disabled={pendingAction === 'start'}
        {...pointerAction(() => {
          onStartPreparation?.(order);
          onClose();
        })}
        onKeyDown={(e) =>
          handleButtonKey(e, () => {
            onStartPreparation?.(order);
            onClose();
          })
        }
        style={{ minHeight: 48 }}
        className="min-h-[48px] px-4 py-2 rounded-control font-bold text-sm bg-fmat-primary text-white hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0"
      >
        Iniciar preparación
      </button>
      <button
        type="button"
        data-testid="order-details-action-reject"
        aria-label={`Rechazar insumo para #${orderNumberDisplay}`}
        disabled={pendingAction === 'reject'}
        {...pointerAction(() => {
          onRejectSupplies?.(order);
          onClose();
        })}
        onKeyDown={(e) =>
          handleButtonKey(e, () => {
            onRejectSupplies?.(order);
            onClose();
          })
        }
        style={{ minHeight: 48 }}
        className="min-h-[48px] px-4 py-2 rounded-control font-bold text-sm bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0"
      >
        Rechazar insumo
      </button>
    </>
  );
}

function OrderDetailsVoidActions({
  order,
  orderNumberDisplay,
  pendingAction,
  userRole,
  onAdminVoid,
  onChefVoid,
  onClose,
}: Readonly<{
  order: Order;
  orderNumberDisplay: string;
  pendingAction?: string;
  userRole?: UserRole;
  onAdminVoid?: (order: Order) => void;
  onChefVoid?: (order: Order) => void;
  onClose: () => void;
}>) {
  if (order.status !== 'IN_PREPARATION') return null;
  const canShowAdminVoid =
    Boolean(onAdminVoid) && (!userRole || userRole === 'admin');
  const canShowChefVoid =
    Boolean(onChefVoid) &&
    (!userRole || userRole === 'chef' || userRole === 'admin');

  if (!canShowAdminVoid && !canShowChefVoid) return null;

  return (
    <>
      {canShowAdminVoid && (
        <button
          type="button"
          data-testid="order-details-action-admin-void"
          aria-label={`Anulación administrativa para #${orderNumberDisplay}`}
          disabled={pendingAction === 'void-admin'}
          {...pointerAction(() => {
            onAdminVoid?.(order);
            onClose();
          })}
          onKeyDown={(e) =>
            handleButtonKey(e, () => {
              onAdminVoid?.(order);
              onClose();
            })
          }
          style={{ minHeight: 48 }}
          className="min-h-[48px] px-3.5 py-2 rounded-control font-bold text-sm bg-amber-600 hover:bg-amber-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors flex items-center justify-center cursor-pointer select-none border-0"
        >
          Anular (Admin)
        </button>
      )}
      {canShowChefVoid && (
        <button
          type="button"
          data-testid="order-details-action-chef-void"
          aria-label={`Anulación cocina para #${orderNumberDisplay}`}
          disabled={pendingAction === 'void-kitchen'}
          {...pointerAction(() => {
            onChefVoid?.(order);
            onClose();
          })}
          onKeyDown={(e) =>
            handleButtonKey(e, () => {
              onChefVoid?.(order);
              onClose();
            })
          }
          style={{ minHeight: 48 }}
          className="min-h-[48px] px-3.5 py-2 rounded-control font-bold text-sm bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none border-0"
        >
          Anular (Cocina)
        </button>
      )}
    </>
  );
}

function OrderDetailsReadyAction({
  order,
  orderNumberDisplay,
  pendingAction,
  isPendingUndoOrder,
  undoOrderSecondsLeft,
  onMarkOrderReady,
  onUndoOrderReady,
}: Readonly<{
  order: Order;
  orderNumberDisplay: string;
  pendingAction?: string;
  isPendingUndoOrder?: boolean;
  undoOrderSecondsLeft?: number;
  onMarkOrderReady?: (order: Order) => void;
  onUndoOrderReady?: (order: Order) => void;
}>) {
  if (order.status !== 'IN_PREPARATION') return null;

  if (isPendingUndoOrder) {
    return (
      <div
        data-testid="order-details-undo-ready-banner"
        className="flex items-center justify-between gap-3 p-2.5 rounded-control bg-amber-50 border border-amber-300 min-h-[48px] flex-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span
            data-testid="order-details-undo-countdown"
            className="text-xs sm:text-sm font-bold text-amber-900 leading-tight"
          >
            Enviando en {undoOrderSecondsLeft}s
          </span>
        </div>
        <button
          type="button"
          data-testid="order-details-action-undo-ready"
          aria-label={`Deshacer comanda lista para #${orderNumberDisplay}`}
          {...pointerAction(() => onUndoOrderReady?.(order))}
          onKeyDown={(event) => handleButtonKey(event, () => onUndoOrderReady?.(order))}
          style={{ minHeight: 48 }}
          className="min-h-[48px] px-4 py-1.5 rounded-control font-extrabold text-xs sm:text-sm bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm flex items-center justify-center cursor-pointer transition-colors border-0 shrink-0"
        >
          Deshacer
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="order-details-action-ready"
      aria-label={`Comanda lista para #${orderNumberDisplay}`}
      disabled={pendingAction === 'order-ready'}
      {...pointerAction(() => onMarkOrderReady?.(order))}
      onKeyDown={(e) => handleButtonKey(e, () => onMarkOrderReady?.(order))}
      style={{ minHeight: 48 }}
      className="min-h-[48px] px-5 py-2.5 rounded-control font-bold text-sm sm:text-base bg-fmat-primary text-white hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0"
    >
      Comanda lista
    </button>
  );
}

function OrderDetailsActions(props: Readonly<OrderDetailsActionsProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap flex-1">
      <OrderDetailsReservedActions {...props} />
      <OrderDetailsVoidActions {...props} />
      <OrderDetailsReadyAction {...props} />
    </div>
  );
}

/**
 * Modal dialog displaying full order details on top of the KDS grid.
 */
export function OrderDetailsDialog({
  order,
  isOpen,
  onClose,
  onItemReady,
  onUndoItemReady,
  onStartPreparation,
  onRejectSupplies,
  onMarkOrderReady,
  onUndoOrderReady,
  onAdminVoid,
  onChefVoid,
  userRole,
  pendingAction,
  pendingUndoItem,
  isPendingUndoOrder,
  undoOrderSecondsLeft = 15,
  pendingOrderTriggeringItemId,
  optimisticReadyItemIds,
}: Readonly<OrderDetailsDialogProps>) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
    }
  }, [isOpen]);

  const { inPrepAt, stockReservedAt, isFinished } = getOrderStopwatchTiming(order);

  const rawElapsedTime = useElapsedTime(
    inPrepAt,
    stockReservedAt,
    isFinished && order?.updatedAt ? { endTime: order.updatedAt } : undefined,
  );

  const { formattedTime, delayStatus, delayLabel, delayColorToken } = isFinished
    ? {
        ...rawElapsedTime,
        delayStatus: 'on_time' as const,
        delayLabel: 'Entregada' as const,
        delayColorToken: 'var(--color-success)' as const,
      }
    : rawElapsedTime;

  if (!isOpen || !order) return null;

  const displayId = getOrderKey(order) || 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);
  const tableDisplay = getOrderTableDisplay(order);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="order-details-title"
      data-testid="order-details-dialog"
      onKeyDown={handleKeyDown}
      className="orders-kds-root fixed inset-0 z-50 m-0 p-3 sm:p-6 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-xs border-none select-none"
    >
      <div className="w-full max-w-2xl max-h-[92vh] rounded-card bg-surface border border-border shadow-2xl flex flex-col text-ink overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <header className="bg-fmat-primary text-white p-4 sm:p-5 flex flex-col gap-2 shrink-0 border-b border-fmat-primary-hover">
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
              {tableDisplay && (
                <span
                  data-testid="order-details-table"
                  className="text-lg sm:text-xl font-black tracking-wide text-white"
                >
                  {tableDisplay}
                </span>
              )}
              {tableDisplay && (
                <span className="text-white/80 font-mono font-bold text-sm">·</span>
              )}
              <h2
                id="order-details-title"
                data-testid="order-details-id"
                className="text-base sm:text-lg font-bold font-mono tracking-wider text-white"
              >
                #{orderNumberDisplay}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={order.status} />
              <button
                ref={closeBtnRef}
                type="button"
                data-testid="order-details-close-btn"
                aria-label="Cerrar detalles de comanda"
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white cursor-pointer border-0"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stopwatch & delay info */}
          <div className="flex items-center justify-between w-full mt-1">
            <div
              data-testid="order-details-stopwatch"
              data-delay-status={delayStatus}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-mono text-xs sm:text-sm font-bold shadow-sm whitespace-nowrap shrink-0 ${
                delayStatus === 'warning' ? 'text-gray-950 font-black' : 'text-white'
              }`}
              style={{ backgroundColor: delayColorToken }}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{formattedTime}</span>
              <span className="text-xs uppercase tracking-wider opacity-95">
                ({delayLabel})
              </span>
            </div>

            <span className="text-xs font-semibold text-white/90">
              {order.items.length} {order.items.length === 1 ? 'platillo' : 'platillos'}
            </span>
          </div>
        </header>

        {/* Modal Body: Full list of dishes */}
        <section
          aria-label="Lista completa de platillos de la comanda"
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 bg-canvas scrollbar-thin scrollbar-thumb-gray-300"
        >
          <ul
            data-testid="order-details-items-list"
            className="list-none m-0 p-0 flex flex-col gap-3"
          >
            {order.items.map((item, index) => {
              const itemId = getItemKey(item, index);
              const isPendingUndo = pendingUndoItem?.itemId === itemId;
              const isOptimisticallyReady =
                Boolean(optimisticReadyItemIds?.has(itemId)) ||
                Boolean(
                  isPendingUndoOrder &&
                    (pendingOrderTriggeringItemId
                      ? pendingOrderTriggeringItemId === itemId
                      : true),
                );

              return (
                <OrderDetailsItemRow
                  key={itemId}
                  order={order}
                  item={item}
                  index={index}
                  onItemReady={onItemReady}
                  onUndoItemReady={onUndoItemReady}
                  isPending={pendingAction === `item:${itemId}`}
                  isPendingUndo={isPendingUndo}
                  isOptimisticallyReady={isOptimisticallyReady}
                  undoSecondsLeft={pendingUndoItem?.secondsLeft}
                />
              );
            })}
          </ul>
        </section>

        {/* Modal Footer: Actions & Close */}
        <footer className="p-3 sm:p-4 bg-surface border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <OrderDetailsActions
            order={order}
            orderNumberDisplay={orderNumberDisplay}
            pendingAction={pendingAction}
            userRole={userRole}
            isPendingUndoOrder={isPendingUndoOrder}
            undoOrderSecondsLeft={undoOrderSecondsLeft}
            onStartPreparation={onStartPreparation}
            onRejectSupplies={onRejectSupplies}
            onAdminVoid={onAdminVoid}
            onChefVoid={onChefVoid}
            onMarkOrderReady={onMarkOrderReady}
            onUndoOrderReady={onUndoOrderReady}
            onClose={onClose}
          />

          <button
            type="button"
            data-testid="order-details-bottom-close-btn"
            onClick={onClose}
            style={{ minHeight: 48 }}
            className="min-h-[48px] px-6 py-2.5 rounded-control font-bold text-sm bg-surface text-ink hover:bg-gray-100 active:bg-gray-200 border border-border shadow-xs transition-colors flex items-center justify-center cursor-pointer select-none shrink-0"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default OrderDetailsDialog;
