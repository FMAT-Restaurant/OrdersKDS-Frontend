import { useState, type KeyboardEvent } from 'react';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import type { UserRole } from '../../shared/types/auth.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { useElapsedTime } from './useElapsedTime.ts';
import { pointerAction } from './pointerAction.ts';

export interface OrderCardProps {
  readonly order: Order;
  readonly onClick?: (order: Order) => void;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
  readonly onItemReady?: (order: Order, item: OrderItem) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly userRole?: UserRole;
  readonly pendingAction?: string;
  readonly isFocused?: boolean;
}

/**
 * Renders a single dish item inside an order card.
 * Notes, modifiers and preparationTimeText are safely escaped by React (ST-19 / XSS prevention).
 */
function OrderCardItem({
  item,
  index,
  onReady,
  isPending,
  isRedoPending,
  isCompact = false,
}: Readonly<{
  item: OrderItem;
  index: number;
  onReady?: () => void;
  isPending: boolean;
  isRedoPending: boolean;
  isCompact?: boolean;
}>) {
  const itemId = item.id ?? item.itemId ?? item.publicId ?? `item-${index}`;
  const prepTime = item.preparationTimeText ?? item.preparation_time_text ?? null;
  const isFinished = item.status === 'READY' || item.status === 'DELIVERED';

  return (
    <li
      data-testid={`order-item-${itemId}`}
      style={{ minHeight: isCompact ? 44 : 64 }}
      data-redo-pending={isRedoPending ? 'true' : undefined}
      className={`border-b border-border last:border-b-0 flex flex-col justify-center py-2 gap-1 ${
        isCompact ? 'min-h-[44px] py-1' : 'min-h-[64px] py-2'
      } ${
        isRedoPending ? 'rounded-md border border-amber-400/70 bg-amber-50 px-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="flex items-baseline gap-2.5 min-w-0 flex-1">
          <span
            className="text-lg font-black text-fmat-primary min-w-[28px] shrink-0"
            data-testid={`order-item-qty-${itemId}`}
          >
            {item.quantity}x
          </span>
          <span
            className="text-base sm:text-lg font-bold text-ink leading-tight break-words"
            data-testid={`order-item-name-${itemId}`}
          >
            {item.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {prepTime && (
            <span
              className="text-xs font-mono font-semibold text-muted bg-gray-100 border border-border px-2 py-0.5 rounded shrink-0"
              data-testid={`order-item-prep-time-${itemId}`}
            >
              {prepTime}
            </span>
          )}

          {/* Dedicated Checkmark Ready Action Button (RF-09, RF-10) */}
          <button
            type="button"
            data-testid={`order-item-action-${itemId}`}
            disabled={isFinished || isPending}
            aria-label={`Marcar ${item.name} como listo`}
            {...pointerAction(() => {
              if (!isFinished) onReady?.();
            })}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && !isFinished) {
                event.preventDefault();
                onReady?.();
              }
            }}
            className={`min-h-[36px] px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              isFinished
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default opacity-80'
                : 'bg-white hover:bg-emerald-50 active:bg-emerald-100 text-body hover:text-emerald-700 border border-border hover:border-emerald-300 cursor-pointer shadow-sm'
            }`}
          >
            {isFinished ? (
              <>
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                <span>Listo</span>
              </>
            ) : (
              <>
                <span className="w-3.5 h-3.5 rounded-full border border-gray-400 inline-block shrink-0" />
                <span>Listo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {item.modifiers && item.modifiers.length > 0 && (
        <div
          className="pl-8 flex flex-wrap gap-1.5 mt-0.5"
          data-testid={`order-item-modifiers-${itemId}`}
        >
          {item.modifiers.map((modifier, modIdx) => (
            <span
              key={`${itemId}-mod-${modIdx}`}
              className={`inline-block px-2 py-0.5 font-medium rounded bg-gray-100 text-body border border-border ${
                isCompact ? 'text-[11px]' : 'text-xs'
              }`}
              data-testid={`order-item-modifier-${itemId}-${modIdx}`}
            >
              + {modifier}
            </span>
          ))}
        </div>
      )}

      {item.notes && (
        <div
          className="pl-8 text-sm text-body italic flex items-start gap-1"
          data-testid={`order-item-notes-${itemId}`}
        >
          <span className="font-bold not-italic shrink-0 text-ink">Nota:</span>
          <span className="sr-only">Note:</span>
          <span className="break-words">{item.notes}</span>
        </div>
      )}

      {isRedoPending && (
        <output
          data-testid={`redo-pending-${itemId}`}
          className="pl-8 text-xs font-black uppercase tracking-wide text-amber-800 block"
        >
          Rehacer pendiente
        </output>
      )}
    </li>
  );
}

interface OrderCardActionsProps {
  readonly order: Order;
  readonly displayId: string;
  readonly pendingAction?: string;
  readonly userRole?: UserRole;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
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

function TableHeader({
  tableNumber,
  isTakeaway,
  displayId,
}: Readonly<{
  tableNumber?: number | null;
  isTakeaway?: boolean;
  displayId: string;
}>) {
  if (tableNumber !== null && tableNumber !== undefined) {
    return (
      <span
        className="text-xl sm:text-2xl font-black text-white tracking-wide whitespace-nowrap"
        data-testid={`order-table-${displayId}`}
      >
        Mesa {tableNumber}{' '}
        <span className="sr-only">Table {tableNumber}</span>
      </span>
    );
  }
  if (isTakeaway) {
    return (
      <span
        className="text-lg sm:text-xl font-black text-amber-200 uppercase tracking-wider whitespace-nowrap"
        data-testid={`order-takeaway-${displayId}`}
      >
        Para llevar{' '}
        <span className="sr-only">Takeaway</span>
      </span>
    );
  }
  return null;
}

function OrderCardActions({
  order,
  displayId,
  pendingAction,
  userRole,
  onStartPreparation,
  onRejectSupplies,
  onAdminVoid,
  onChefVoid,
  onMarkOrderReady,
}: Readonly<OrderCardActionsProps>) {
  const isReserved = order.status === 'RESERVED';
  const isInPrep = order.status === 'IN_PREPARATION';
  const canShowAdminVoid =
    Boolean(onAdminVoid) && (!userRole || userRole === 'admin');
  const canShowChefVoid =
    Boolean(onChefVoid) &&
    (!userRole || userRole === 'chef' || userRole === 'admin');
  const canShowReady =
    order.status !== 'DELIVERED' &&
    order.status !== 'PAID' &&
    order.status !== 'CANCELLED';

  return (
    <>
      {isReserved && (
        <div
          data-testid={`order-actions-${displayId}`}
          className="shrink-0 px-4 pb-2 pt-1.5 flex items-center gap-3 w-full bg-transparent"
        >
          <button
            type="button"
            data-testid={`order-action-start-${displayId}`}
            aria-label={`Iniciar preparación para la comanda ${displayId}`}
            disabled={pendingAction === 'start'}
            {...pointerAction(() => onStartPreparation?.(order))}
            onKeyDown={(e) => handleButtonKey(e, () => onStartPreparation?.(order))}
            style={{ minHeight: 64 }}
            className="min-h-[64px] min-h-[48px] flex-1 px-3 py-2 rounded-md font-bold text-sm bg-fmat-primary text-white hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150 flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50"
          >
            Iniciar preparación
          </button>
          <button
            type="button"
            data-testid={`order-action-reject-${displayId}`}
            aria-label={`Rechazar insumo para la comanda ${displayId}`}
            disabled={pendingAction === 'reject'}
            {...pointerAction(() => onRejectSupplies?.(order))}
            onKeyDown={(e) => handleButtonKey(e, () => onRejectSupplies?.(order))}
            style={{ minHeight: 64 }}
            className="min-h-[64px] min-h-[48px] flex-1 px-3 py-2 rounded-md font-bold text-sm bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors duration-150 flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50"
          >
            Rechazar insumo
          </button>
        </div>
      )}

      {isInPrep && (canShowAdminVoid || canShowChefVoid) && (
        <div
          data-testid={`order-void-actions-${displayId}`}
          className="shrink-0 px-4 pb-2 pt-1.5 flex items-center gap-3 w-full bg-transparent"
        >
          {canShowAdminVoid && (
            <button
              type="button"
              data-testid={`order-action-admin-void-${displayId}`}
              aria-label={`Anulación administrativa para la comanda ${displayId}`}
              disabled={pendingAction === 'void-admin'}
              {...pointerAction(() => onAdminVoid?.(order))}
              onKeyDown={(e) => handleButtonKey(e, () => onAdminVoid?.(order))}
              style={{ minHeight: 64 }}
              className="min-h-[64px] flex-1 px-3 py-2 rounded-md font-bold text-sm bg-amber-700 hover:bg-amber-600 text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors duration-150 flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50"
            >
              Anular (Admin)
            </button>
          )}
          {canShowChefVoid && (
            <button
              type="button"
              data-testid={`order-action-chef-void-${displayId}`}
              aria-label={`Anulación por error de cocina para la comanda ${displayId}`}
              disabled={pendingAction === 'void-kitchen'}
              {...pointerAction(() => onChefVoid?.(order))}
              onKeyDown={(e) => handleButtonKey(e, () => onChefVoid?.(order))}
              style={{ minHeight: 64 }}
              className="min-h-[64px] flex-1 px-3 py-2 rounded-md font-bold text-sm bg-red-700 hover:bg-red-600 text-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors duration-150 flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50"
            >
              Anular (Cocina)
            </button>
          )}
        </div>
      )}

      {canShowReady && (
        <button
          type="button"
          data-testid={`order-action-ready-${displayId}`}
          aria-label={`Comanda lista para la comanda ${displayId}`}
          disabled={pendingAction === 'order-ready'}
          {...pointerAction(() => onMarkOrderReady?.(order))}
          onKeyDown={(e) => handleButtonKey(e, () => onMarkOrderReady?.(order))}
          style={{ minHeight: 64 }}
          className="shrink-0 mx-4 mb-3 min-h-[64px] min-h-[48px] rounded-md bg-fmat-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary active:scale-[.98] disabled:opacity-50"
        >
          Comanda lista
        </button>
      )}
    </>
  );
}

function getStopwatchState(order: Order) {
  const inPrepAt = order.in_preparation_at ?? order.inPreparationAt ?? null;
  const stockReservedAt = order.stock_reserved_at ?? order.stockReservedAt ?? null;
  const isDelivered = order.status === 'DELIVERED';
  const hasRedoPending =
    isDelivered && order.items.some((item) => item.status === 'PENDING');
  const isFinished = isDelivered && !hasRedoPending;

  return { inPrepAt, stockReservedAt, isFinished };
}

/**
 * Production-ready OrderCard component for the KDS (TASK-15 Phase 2, ADR-0012, TASK-40a).
 * Displays large table number, order ID, live delay stopwatch (OP-11), StatusBadge,
 * high-contrast kitchen items list, touch-friendly 64px actions, and keyboard parity.
 */
function getOrderNumberDisplay(
  orderNumber: number | null | undefined,
  displayId: string,
): string {
  if (orderNumber != null) {
    return String(orderNumber);
  }
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(displayId);
  if (isUuid) {
    return displayId.slice(-4).toUpperCase();
  }
  return displayId.replace(/^ord-/, '');
}

export function OrderCard({
  order,
  onClick,
  onStartPreparation,
  onMarkOrderReady,
  onItemReady,
  onRejectSupplies,
  onAdminVoid,
  onChefVoid,
  userRole,
  pendingAction,
  isFocused = false,
}: Readonly<OrderCardProps>) {
  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);
  const hasTableHeader =
    (order.tableNumber !== null && order.tableNumber !== undefined) || order.isTakeaway;

  const [isCompact, setIsCompact] = useState(order.items.length >= 5);

  const { inPrepAt, stockReservedAt, isFinished } = getStopwatchState(order);

  const rawElapsedTime = useElapsedTime(
    inPrepAt,
    stockReservedAt,
    isFinished && order.updatedAt ? { endTime: order.updatedAt } : undefined,
  );

  const { formattedTime, delayStatus, delayLabel, delayColorToken } = isFinished
    ? {
        ...rawElapsedTime,
        delayStatus: 'on_time' as const,
        delayLabel: 'Entregada' as const,
        delayColorToken: 'var(--color-success)' as const,
      }
    : rawElapsedTime;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.code === 'NumpadEnter' || event.key === ' ') {
      event.preventDefault();
      if (event.key === 'Enter' && order.status === 'RESERVED') {
        onStartPreparation?.(order);
      } else {
        onClick?.(order);
      }
    }
  };

  return (
    <article
      data-testid={`order-card-${displayId}`}
      aria-label={`Order ${displayId}`}
      className={`h-full min-h-0 flex flex-col rounded-card border transition-all duration-150 select-none overflow-hidden bg-surface ${
        isFocused
          ? 'border-fmat-primary ring-2 ring-fmat-primary shadow-xl'
          : 'border-border hover:border-gray-400 shadow-sm'
      }`}
    >
      {/* Clickable Card Header for Order Selection - Solid Orange Banner (Image 10) */}
      <button
        type="button"
        data-testid={`order-card-stub-${displayId}`}
        aria-label={`Order ${displayId}`}
        {...pointerAction(() => onClick?.(order))}
        onKeyDown={handleKeyDown}
        className={`w-full shrink-0 p-4 pb-3 select-none cursor-pointer flex flex-col justify-between text-left bg-fmat-primary text-white border-0 border-b border-fmat-primary-hover focus:outline-none ${
          isFocused ? 'ring-2 ring-fmat-primary' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 whitespace-nowrap overflow-hidden">
            <TableHeader
              tableNumber={order.tableNumber}
              isTakeaway={order.isTakeaway}
              displayId={displayId}
            />
            {hasTableHeader && (
              <span className="text-white/80 font-mono font-bold text-sm">·</span>
            )}
            <span
              className="text-sm sm:text-base font-bold font-mono tracking-wider text-white truncate"
              data-testid={`order-id-${displayId}`}
              title={`#${displayId}`}
            >
              #{orderNumberDisplay}
              <span className="sr-only">#{displayId}</span>
            </span>
          </div>

          <div
            data-testid={`order-status-${displayId}`}
            className="flex items-center gap-1.5 shrink-0"
          >
            <StatusBadge status={order.status} />
            <span className="sr-only">{order.status}</span>
          </div>
        </div>

        {/* Live Stopwatch & Semáforo */}
        <div className="flex items-center justify-between w-full mt-2">
          <div
            data-testid={`order-stopwatch-${displayId}`}
            data-delay-status={delayStatus}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-md font-mono text-sm font-bold shadow-sm ${
              delayStatus === 'warning' ? 'text-gray-950 font-black' : 'text-white'
            }`}
            style={{ backgroundColor: delayColorToken }}
            aria-label={`Tiempo transcurrido: ${formattedTime}, estado: ${delayLabel}`}
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
            <span data-testid={`order-timer-${displayId}`}>{formattedTime}</span>
            <span
              data-testid={`order-delay-label-${displayId}`}
              className="text-xs uppercase tracking-wider opacity-95"
            >
              ({delayLabel})
            </span>
          </div>
        </div>
      </button>

      {order.items.length >= 5 && (
        <div className="shrink-0 px-4 py-1.5 flex items-center justify-between bg-gray-50 border-b border-border text-xs">
          <span className="text-muted font-medium">
            {order.items.length} platillos en comanda
          </span>
          <button
            type="button"
            data-testid={`order-compact-toggle-${displayId}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsCompact((prev) => !prev);
            }}
            className="text-fmat-primary hover:text-fmat-primary-hover font-semibold px-2 py-0.5 rounded bg-surface border border-border focus:outline-none focus:ring-1 focus:ring-fmat-primary cursor-pointer"
          >
            {isCompact ? 'Expandir detalles' : 'Vista compacta'}
          </button>
        </div>
      )}

      {/* Dish Items List */}
      <ul
        data-testid={`order-items-list-${displayId}`}
        className="flex-1 min-h-0 list-none m-0 px-4 my-1 overflow-y-auto divide-y divide-border bg-surface scrollbar-thin scrollbar-thumb-gray-300"
        aria-label={`Platillos para la comanda ${displayId}`}
      >
        {order.items.map((item, index) => {
          const itemId = item.id ?? item.itemId ?? item.publicId ?? `item-${index}`;
          const isRedoPending = order.status === 'DELIVERED' && item.status === 'PENDING';
          return (
            <OrderCardItem
              key={itemId}
              item={item}
              index={index}
              onReady={() => onItemReady?.(order, item)}
              isPending={
                pendingAction === `item:${item.id ?? item.itemId ?? item.publicId ?? index}`
              }
              isRedoPending={isRedoPending}
              isCompact={isCompact}
            />
          );
        })}
      </ul>

      {/* Footer info: Total items count */}
      <div className="shrink-0 px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted w-full bg-gray-50/50">
        <span>{order.items.length} {order.items.length === 1 ? 'platillo' : 'platillos'}</span>
        <span>Toca o presiona Enter para seleccionar</span>
      </div>

      <OrderCardActions
        order={order}
        displayId={displayId}
        pendingAction={pendingAction}
        userRole={userRole}
        onStartPreparation={onStartPreparation}
        onRejectSupplies={onRejectSupplies}
        onAdminVoid={onAdminVoid}
        onChefVoid={onChefVoid}
        onMarkOrderReady={onMarkOrderReady}
      />
    </article>
  );
}

export default OrderCard;
