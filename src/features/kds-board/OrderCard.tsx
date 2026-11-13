import { useState, type KeyboardEvent } from 'react';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import type { UserRole } from '../../shared/types/auth.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { useElapsedTime } from './useElapsedTime.ts';
import { pointerAction } from './pointerAction.ts';
import { getItemKey, getOrderKey, getOrderNumberDisplay } from './orderNumberDisplay.ts';
import { formatGraceCountdown, getOrderTtlStatus, type OrderTtlStatus } from './kdsTtl.ts';

export interface PendingUndoItem {
  readonly orderId: string;
  readonly itemId?: string;
  readonly type?: 'item' | 'order';
  readonly secondsLeft: number;
}

export interface OrderCardProps {
  readonly order: Order;
  readonly onClick?: (order: Order) => void;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
  readonly onItemReady?: (order: Order, item: OrderItem) => void;
  readonly onRejectSupplies?: (order: Order, item?: OrderItem) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly userRole?: UserRole;
  readonly pendingAction?: string;
  readonly isFocused?: boolean;
  readonly pendingUndoItem?: PendingUndoItem | null;
  readonly onUndoReady?: (order: Order, item: OrderItem) => void;
  readonly isPendingUndoOrder?: boolean;
  readonly undoOrderSecondsLeft?: number;
  readonly pendingOrderTriggeringItemId?: string;
  readonly onUndoOrderReady?: (order: Order) => void;
  readonly optimisticReadyItemIds?: Set<string>;
  readonly isCompact?: boolean;
  readonly isExpiredTab?: boolean;
}

interface OrderItemUndoBannerProps {
  readonly itemId: string;
  readonly itemName: string;
  readonly undoSecondsLeft: number;
  readonly isManyItems: boolean;
  readonly onUndo?: () => void;
}

function OrderItemUndoBanner({
  itemId,
  itemName,
  undoSecondsLeft,
  isManyItems,
  onUndo,
}: Readonly<OrderItemUndoBannerProps>) {
  return (
    <div
      className="mt-1.5 w-full flex flex-wrap items-center justify-between gap-2 p-2 rounded-md bg-amber-50 border border-amber-300 shadow-xs"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span
          data-testid={`order-item-undo-countdown-${itemId}`}
          className="text-xs sm:text-sm font-bold text-amber-900 leading-tight"
        >
          Listo — pendiente de enviar ({undoSecondsLeft}s)
        </span>
      </div>
      <button
        type="button"
        data-testid={`order-item-undo-${itemId}`}
        aria-label={`Deshacer listo para ${itemName}`}
        {...pointerAction(() => onUndo?.())}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onUndo?.();
          }
        }}
        style={{ minWidth: 64, minHeight: isManyItems ? 40 : 44 }}
        className="min-w-[64px] min-h-[40px] px-3.5 py-1.5 rounded-control text-xs sm:text-sm font-extrabold bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 select-none border-0 shrink-0 ml-auto"
      >
        Deshacer
      </button>
    </div>
  );
}

interface OrderItemReadyButtonProps {
  readonly itemId: string;
  readonly itemName: string;
  readonly isFinished: boolean;
  readonly isPending: boolean;
  readonly onReady?: () => void;
}

function OrderItemReadyButton({
  itemId,
  itemName,
  isFinished,
  isPending,
  onReady,
}: Readonly<OrderItemReadyButtonProps>) {
  return (
    <button
      type="button"
      data-testid={`order-item-action-${itemId}`}
      disabled={isFinished || isPending}
      aria-label={`Marcar ${itemName} como listo`}
      {...pointerAction(() => {
        if (!isFinished) onReady?.();
      })}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !isFinished) {
          event.preventDefault();
          onReady?.();
        }
      }}
      className={`min-h-[36px] px-2.5 py-1 rounded-control text-xs font-bold transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
        isFinished
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default opacity-80'
          : 'bg-surface hover:bg-emerald-50 active:bg-emerald-100 text-body hover:text-emerald-700 border border-border hover:border-emerald-300 cursor-pointer shadow-sm'
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
  );
}

function OrderItemModifiers({
  itemId,
  modifiers,
  isManyItems,
}: Readonly<{
  itemId: string;
  modifiers: string[];
  isManyItems: boolean;
}>) {
  return (
    <div
      className="pl-8 flex flex-wrap gap-1.5 mt-0.5"
      data-testid={`order-item-modifiers-${itemId}`}
    >
      {modifiers.map((modifier, modIdx) => (
        <span
          key={`${itemId}-mod-${modIdx}`}
          className={`inline-block px-2 py-0.5 font-medium rounded bg-gray-100 text-body border border-border ${
            isManyItems ? 'text-[11px]' : 'text-xs'
          }`}
          data-testid={`order-item-modifier-${itemId}-${modIdx}`}
        >
          + {modifier}
        </span>
      ))}
    </div>
  );
}

function OrderItemNotes({
  itemId,
  notes,
}: Readonly<{
  itemId: string;
  notes: string;
}>) {
  return (
    <div
      className="pl-8 text-sm text-body italic flex items-start gap-1"
      data-testid={`order-item-notes-${itemId}`}
    >
      <span className="font-bold not-italic shrink-0 text-ink">Nota:</span>
      <span className="sr-only">Note:</span>
      <span className="break-words">{notes}</span>
    </div>
  );
}

/**
 * Renders a single dish item inside an order card.
 * Notes, modifiers and preparationTimeText are safely escaped by React (ST-19 / XSS prevention).
 * In large orders (>= 5 items), details are collapsed by default with an individual toggle button per dish.
 */
function OrderCardItem({
  item,
  index,
  onReady,
  onUndo,
  onRejectSupplies,
  isPending,
  isRedoPending,
  isPendingUndo = false,
  isOptimisticallyReady = false,
  undoSecondsLeft = 15,
  isManyItems = false,
  isCompact = false,
  isReadOnlyExpired = false,
}: Readonly<{
  item: OrderItem;
  index: number;
  onReady?: () => void;
  onUndo?: () => void;
  onRejectSupplies?: () => void;
  isPending: boolean;
  isRedoPending: boolean;
  isPendingUndo?: boolean;
  isOptimisticallyReady?: boolean;
  undoSecondsLeft?: number;
  isManyItems?: boolean;
  isCompact?: boolean;
  isReadOnlyExpired?: boolean;
}>) {
  const itemId = getItemKey(item, index);
  const prepTime = item.preparationTimeText ?? item.preparation_time_text ?? null;
  const isFinished = item.status === 'READY' || item.status === 'DELIVERED' || Boolean(isOptimisticallyReady);
  const hasDetails = Boolean(item.modifiers?.length || item.notes);
  const isCompactDensity = isCompact || isManyItems;
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(!isCompactDensity);
  const showDetails = !isCompactDensity || isDetailsExpanded;

  return (
    <li
      data-testid={`order-item-${itemId}`}
      style={{ minHeight: isCompactDensity ? 40 : 64 }}
      data-redo-pending={isRedoPending ? 'true' : undefined}
      data-undo-pending={isPendingUndo ? 'true' : undefined}
      className={`border-b border-border last:border-b-0 flex flex-col justify-center py-2 gap-1 ${
        isCompactDensity ? 'min-h-[40px] py-1' : 'min-h-[64px] py-2'
      } ${
        isRedoPending ? 'rounded-md border border-amber-400/70 bg-amber-50 px-2' : ''
      } ${
        isPendingUndo ? 'rounded-md border border-amber-300 bg-amber-50/70 px-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="flex items-baseline gap-1.5 min-w-0 flex-1 flex-wrap">
          <span
            className="text-base sm:text-lg font-black text-fmat-primary shrink-0 min-w-[24px]"
            data-testid={`order-item-qty-${itemId}`}
          >
            {item.quantity}x
          </span>
          <span
            className="text-sm sm:text-base font-bold text-ink leading-snug break-words"
            data-testid={`order-item-name-${itemId}`}
          >
            {item.name}
          </span>
          {isCompactDensity && hasDetails && (
            <button
              type="button"
              data-testid={`order-item-toggle-details-${itemId}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsDetailsExpanded((prev) => !prev);
              }}
              aria-expanded={isDetailsExpanded}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-fmat-primary bg-orange-50 hover:bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded cursor-pointer select-none leading-none shrink-0"
            >
              <span>{isDetailsExpanded ? '− notas' : '+ notas'}</span>
              <span className="sr-only">
                {isDetailsExpanded ? 'Ocultar detalles' : 'Ver detalles'}
              </span>
            </button>
          )}
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

          {!isPendingUndo && !isReadOnlyExpired && (
            <OrderItemReadyButton
              itemId={itemId}
              itemName={item.name}
              isFinished={isFinished}
              isPending={isPending}
              onReady={onReady}
            />
          )}

          {isRedoPending && !isFinished && !isPendingUndo && (
            <button
              type="button"
              data-testid={`order-item-reject-redo-${itemId}`}
              aria-label={`Rechazar ${item.name} por falta de insumos`}
              disabled={isPending}
              {...pointerAction(() => onRejectSupplies?.())}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRejectSupplies?.();
                }
              }}
              style={{ minHeight: isCompactDensity ? 36 : 40 }}
              className="min-h-[36px] px-2.5 py-1 rounded-control text-xs font-bold bg-surface hover:bg-red-50 active:bg-red-100 text-red-700 hover:text-red-800 border border-red-300 hover:border-red-400 cursor-pointer shadow-sm transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Sin insumos
            </button>
          )}
        </div>
      </div>

      {isPendingUndo && (
        <OrderItemUndoBanner
          itemId={itemId}
          itemName={item.name}
          undoSecondsLeft={undoSecondsLeft}
          isManyItems={isCompactDensity}
          onUndo={onUndo}
        />
      )}

      {showDetails && Boolean(item.modifiers?.length) && (
        <OrderItemModifiers
          itemId={itemId}
          modifiers={item.modifiers ?? []}
          isManyItems={isCompactDensity}
        />
      )}

      {showDetails && item.notes && (
        <OrderItemNotes itemId={itemId} notes={item.notes} />
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

interface OrderReadyUndoBannerProps {
  readonly displayId: string;
  readonly undoSecondsLeft?: number;
  readonly isCompact?: boolean;
  readonly onUndo?: () => void;
}

function OrderReadyUndoBanner({
  displayId,
  undoSecondsLeft = 15,
  isCompact = false,
  onUndo,
}: Readonly<OrderReadyUndoBannerProps>) {
  return (
    <div
      data-testid={`order-undo-ready-${displayId}`}
      className={`shrink-0 ${
        isCompact
          ? 'mx-2 sm:mx-2.5 mb-1.5 sm:mb-2 p-2 min-h-[48px]'
          : 'mx-3 sm:mx-4 mb-2.5 sm:mb-3 p-2.5 min-h-[64px]'
      } rounded-control bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 shadow-xs`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span
          data-testid={`order-undo-countdown-${displayId}`}
          className="text-xs sm:text-sm font-bold text-amber-900 leading-tight"
        >
          Comanda lista — enviando en {undoSecondsLeft}s
        </span>
      </div>
      <button
        type="button"
        data-testid={`order-action-undo-ready-${displayId}`}
        aria-label={`Deshacer comanda lista para #${displayId}`}
        {...pointerAction(() => onUndo?.())}
        onKeyDown={(event) => handleButtonKey(event, onUndo)}
        style={{ minWidth: 64, minHeight: isCompact ? 40 : 44 }}
        className={`min-w-[64px] ${
          isCompact ? 'min-h-[40px] px-3 py-1' : 'min-h-[44px] px-4 py-2'
        } rounded-control font-extrabold text-xs sm:text-sm bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 select-none border-0 shrink-0 ml-auto`}
      >
        Deshacer
      </button>
    </div>
  );
}

interface OrderCardActionsProps {
  readonly order: Order;
  readonly displayId: string;
  readonly pendingAction?: string;
  readonly userRole?: UserRole;
  readonly isCompact?: boolean;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order, item?: OrderItem) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
  readonly onMarkOrderReady?: (order: Order) => void;
  readonly isPendingUndoOrder?: boolean;
  readonly undoOrderSecondsLeft?: number;
  readonly onUndoOrderReady?: (order: Order) => void;
  readonly ttlStatus?: OrderTtlStatus;
  readonly isExpiredTab?: boolean;
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
  isCompact = false,
}: Readonly<{
  tableNumber?: number | null;
  isTakeaway?: boolean;
  displayId: string;
  isCompact?: boolean;
}>) {
  if (tableNumber !== null && tableNumber !== undefined) {
    return (
      <span
        className={`${
          isCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
        } font-black text-white tracking-wide whitespace-nowrap shrink-0`}
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
        className={`${
          isCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
        } font-black text-amber-200 uppercase tracking-wider whitespace-nowrap shrink-0`}
        data-testid={`order-takeaway-${displayId}`}
      >
        Para llevar{' '}
        <span className="sr-only">Takeaway</span>
      </span>
    );
  }
  return null;
}

interface OrderCardReservedActionsProps {
  readonly order: Order;
  readonly displayId: string;
  readonly pendingAction?: string;
  readonly isCompact?: boolean;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly ttlStatus?: OrderTtlStatus;
  readonly isExpiredTab?: boolean;
}

function OrderCardExpiredTabActions({
  order,
  displayId,
  pendingAction,
  isCompact = false,
  onRejectSupplies,
}: Readonly<OrderCardReservedActionsProps>) {
  return (
    <div
      data-testid={`order-actions-${displayId}`}
      className={`shrink-0 ${
        isCompact ? 'px-2.5 pb-2 pt-0.5' : 'px-4 pb-3 pt-1'
      } flex flex-col items-center w-full bg-transparent`}
    >
      <div
        data-testid={`order-ttl-expired-alert-${displayId}`}
        className="w-full mb-1.5 p-1.5 rounded bg-red-100 border border-red-300 text-red-900 text-xs font-bold text-center"
      >
        Comanda caducada por tiempo de reserva (TTL)
      </div>
      <button
        type="button"
        data-testid={`order-action-reject-${displayId}`}
        aria-label={`Rechazar insumo para la comanda ${displayId}`}
        disabled={pendingAction === 'reject'}
        {...pointerAction(() => onRejectSupplies?.(order))}
        onKeyDown={(e) => handleButtonKey(e, () => onRejectSupplies?.(order))}
        style={{ minHeight: isCompact ? 48 : 64 }}
        className={`${
          isCompact
            ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
            : 'min-h-[64px] px-4 py-2.5 text-sm'
        } w-full rounded-control font-bold bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0`}
      >
        Rechazar insumo
      </button>
    </div>
  );
}

function OrderCardReservedActions(props: Readonly<OrderCardReservedActionsProps>) {
  const {
    order,
    displayId,
    pendingAction,
    isCompact = false,
    onStartPreparation,
    onRejectSupplies,
    ttlStatus,
    isExpiredTab,
  } = props;

  if (order.status === 'EXPIRED' || isExpiredTab) {
    return <OrderCardExpiredTabActions {...props} isCompact={isCompact} />;
  }

  if (order.status !== 'RESERVED') return null;

  const isTtlExpired = Boolean(ttlStatus?.isExpired);

  return (
    <div
      data-testid={`order-actions-${displayId}`}
      className={`shrink-0 ${
        isCompact ? 'px-2.5 pb-2 pt-0.5' : 'px-4 pb-3 pt-1'
      } flex flex-col items-center w-full bg-transparent`}
    >
      {isTtlExpired && (
        <div
          data-testid={`order-ttl-expired-alert-${displayId}`}
          className="w-full mb-1.5 p-1 rounded bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold text-center"
        >
          Tiempo límite agotado — Cocina no confirmó a tiempo (Pasando a Caducados en{' '}
          {formatGraceCountdown(ttlStatus?.secondsUntilRemoval ?? 0)})
        </div>
      )}
      <div className={`flex items-center w-full ${isCompact ? 'gap-2' : 'gap-3'}`}>
        <button
          type="button"
          data-testid={`order-action-start-${displayId}`}
          aria-label={
            isTtlExpired
              ? `Preparación bloqueada por expiración para la comanda ${displayId}`
              : `Iniciar preparación para la comanda ${displayId}`
          }
          disabled={pendingAction === 'start' || isTtlExpired}
          {...pointerAction(() => {
            if (!isTtlExpired) onStartPreparation?.(order);
          })}
          onKeyDown={(e) =>
            handleButtonKey(e, () => {
              if (!isTtlExpired) onStartPreparation?.(order);
            })
          }
          style={{ minHeight: isCompact ? 48 : 64 }}
          className={`${
            isCompact
              ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
              : 'min-h-[64px] px-4 py-2.5 text-sm'
          } flex-1 rounded-control font-bold ${
            isTtlExpired
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-60'
              : 'bg-fmat-primary text-white hover:bg-fmat-primary-hover active:scale-[.98]'
          } focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors flex items-center justify-center select-none shadow-sm border-0`}
        >
          {isTtlExpired ? 'Expirada (Bloqueada)' : 'Iniciar preparación'}
        </button>
        <button
          type="button"
          data-testid={`order-action-reject-${displayId}`}
          aria-label={`Rechazar insumo para la comanda ${displayId}`}
          disabled={pendingAction === 'reject'}
          {...pointerAction(() => onRejectSupplies?.(order))}
          onKeyDown={(e) => handleButtonKey(e, () => onRejectSupplies?.(order))}
          style={{ minHeight: isCompact ? 48 : 64 }}
          className={`${
            isCompact
              ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
              : 'min-h-[64px] px-4 py-2.5 text-sm'
          } flex-1 rounded-control font-bold bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0`}
        >
          Rechazar insumo
        </button>
      </div>
    </div>
  );
}

function OrderCardVoidActions({
  order,
  displayId,
  pendingAction,
  userRole,
  isCompact = false,
  onAdminVoid,
  onChefVoid,
}: Readonly<{
  order: Order;
  displayId: string;
  pendingAction?: string;
  userRole?: UserRole;
  isCompact?: boolean;
  onAdminVoid?: (order: Order) => void;
  onChefVoid?: (order: Order) => void;
}>) {
  if (order.status !== 'IN_PREPARATION') return null;

  const canShowAdminVoid =
    Boolean(onAdminVoid) && (!userRole || userRole === 'admin');
  const canShowChefVoid =
    Boolean(onChefVoid) &&
    (!userRole || userRole === 'chef' || userRole === 'admin');

  if (!canShowAdminVoid && !canShowChefVoid) return null;

  return (
    <div
      data-testid={`order-void-actions-${displayId}`}
      className={`shrink-0 ${
        isCompact ? 'px-2.5 pb-1.5 pt-0.5 gap-2' : 'px-4 pb-2 pt-1 gap-3'
      } flex items-center w-full bg-transparent`}
    >
      {canShowAdminVoid && (
        <button
          type="button"
          data-testid={`order-action-admin-void-${displayId}`}
          aria-label={`Anulación administrativa para la comanda ${displayId}`}
          disabled={pendingAction === 'void-admin'}
          {...pointerAction(() => onAdminVoid?.(order))}
          onKeyDown={(e) => handleButtonKey(e, () => onAdminVoid?.(order))}
          style={{ minHeight: isCompact ? 48 : 64 }}
          className={`${
            isCompact
              ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
              : 'min-h-[64px] px-4 py-2.5 text-sm'
          } flex-1 rounded-control font-bold bg-amber-600 hover:bg-amber-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0`}
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
          style={{ minHeight: isCompact ? 48 : 64 }}
          className={`${
            isCompact
              ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
              : 'min-h-[64px] px-4 py-2.5 text-sm'
          } flex-1 rounded-control font-bold bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0`}
        >
          Anular (Cocina)
        </button>
      )}
    </div>
  );
}

function OrderCardReadyAction({
  order,
  displayId,
  pendingAction,
  isCompact = false,
  isPendingUndoOrder,
  undoOrderSecondsLeft,
  onMarkOrderReady,
  onUndoOrderReady,
}: Readonly<{
  order: Order;
  displayId: string;
  pendingAction?: string;
  isCompact?: boolean;
  isPendingUndoOrder?: boolean;
  undoOrderSecondsLeft?: number;
  onMarkOrderReady?: (order: Order) => void;
  onUndoOrderReady?: (order: Order) => void;
}>) {
  if (order.status !== 'IN_PREPARATION') return null;

  if (isPendingUndoOrder) {
    return (
      <OrderReadyUndoBanner
        displayId={displayId}
        undoSecondsLeft={undoOrderSecondsLeft}
        isCompact={isCompact}
        onUndo={() => onUndoOrderReady?.(order)}
      />
    );
  }

  return (
    <button
      type="button"
      data-testid={`order-action-ready-${displayId}`}
      aria-label={`Comanda lista para la comanda ${displayId}`}
      disabled={pendingAction === 'order-ready'}
      {...pointerAction(() => onMarkOrderReady?.(order))}
      onKeyDown={(e) => handleButtonKey(e, () => onMarkOrderReady?.(order))}
      style={{ minHeight: isCompact ? 48 : 64 }}
      className={`shrink-0 ${
        isCompact
          ? 'mx-2 sm:mx-2.5 mb-1.5 sm:mb-2 min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
          : 'mx-3 sm:mx-4 mb-2.5 sm:mb-3 min-h-[64px] px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-base'
      } rounded-control bg-fmat-primary font-bold text-white transition-colors hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary active:scale-[.98] disabled:opacity-50 shadow-sm flex items-center justify-center cursor-pointer border-0`}
    >
      Comanda lista
    </button>
  );
}

function OrderCardRedoActions({
  order,
  displayId,
  pendingAction,
  isCompact = false,
  onRejectSupplies,
}: Readonly<{
  order: Order;
  displayId: string;
  pendingAction?: string;
  isCompact?: boolean;
  onRejectSupplies?: (order: Order, item?: OrderItem) => void;
}>) {
  const isRedoOrder =
    order.status === 'DELIVERED' &&
    order.items.some((i) => i.status === 'PENDING');
  if (!isRedoOrder) return null;

  return (
    <div
      data-testid={`order-redo-actions-${displayId}`}
      className={`shrink-0 ${
        isCompact ? 'px-2.5 pb-2 pt-0.5' : 'px-4 pb-3 pt-1'
      } flex items-center w-full bg-transparent`}
    >
      <button
        type="button"
        data-testid={`order-action-reject-redo-${displayId}`}
        aria-label={`Rechazar rehechura por falta de insumos para la comanda ${displayId}`}
        disabled={pendingAction === 'reject'}
        {...pointerAction(() => {
          const pendingItem = order.items.find((i) => i.status === 'PENDING');
          onRejectSupplies?.(order, pendingItem);
        })}
        onKeyDown={(e) =>
          handleButtonKey(e, () => {
            const pendingItem = order.items.find((i) => i.status === 'PENDING');
            onRejectSupplies?.(order, pendingItem);
          })
        }
        style={{ minHeight: isCompact ? 48 : 64 }}
        className={`${
          isCompact
            ? 'min-h-[48px] px-3 py-1.5 text-xs sm:text-sm'
            : 'min-h-[64px] px-4 py-2.5 text-sm'
        } w-full rounded-control font-bold bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors flex items-center justify-center cursor-pointer select-none active:scale-[.98] disabled:opacity-50 shadow-sm border-0`}
      >
        Rechazar rehechura (Sin insumos)
      </button>
    </div>
  );
}

function OrderCardActions(props: Readonly<OrderCardActionsProps>) {
  if (props.isExpiredTab || props.order.status === 'EXPIRED') {
    return <OrderCardExpiredTabActions {...props} isCompact={props.isCompact} />;
  }

  return (
    <>
      <OrderCardReservedActions {...props} />
      <OrderCardVoidActions {...props} />
      <OrderCardReadyAction {...props} />
      <OrderCardRedoActions {...props} />
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
 * high-contrast kitchen items list, touch-friendly 48px actions, and keyboard parity.
 */
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
  pendingUndoItem,
  onUndoReady,
  isPendingUndoOrder,
  undoOrderSecondsLeft,
  pendingOrderTriggeringItemId,
  onUndoOrderReady,
  optimisticReadyItemIds,
  isCompact = false,
  isExpiredTab = false,
}: Readonly<OrderCardProps>) {
  const displayId = getOrderKey(order) || 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);
  const hasTableHeader = order.tableNumber != null || order.isTakeaway;

  const isManyItems = order.items.length >= 5;

  const ttlStatus = getOrderTtlStatus(order);
  const isOrderExpired = isExpiredTab || ttlStatus.isExpired || order.status === 'EXPIRED';

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
      if (event.key === 'Enter' && order.status === 'RESERVED' && !isOrderExpired) {
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
      className={`h-full min-h-[300px] sm:min-h-0 flex flex-col rounded-card border transition-all duration-150 select-none overflow-hidden bg-surface ${
        isFocused
          ? 'border-fmat-primary ring-2 ring-fmat-primary shadow-xl'
          : 'border-border hover:border-gray-400 shadow hover:shadow-md'
      }`}
    >
      {/* Clickable Card Header for Order Selection - Solid Orange Banner (Image 10) */}
      <button
        type="button"
        data-testid={`order-card-stub-${displayId}`}
        aria-label={`Order ${displayId}`}
        {...pointerAction(() => onClick?.(order))}
        onKeyDown={handleKeyDown}
        className={`w-full shrink-0 ${
          isCompact ? 'p-2 sm:p-2.5 pb-1 sm:pb-1.5' : 'p-3 sm:p-4 pb-2 sm:pb-2.5'
        } select-none cursor-pointer flex flex-col justify-between text-left bg-fmat-primary text-white border-0 border-b border-fmat-primary-hover focus:outline-none ${
          isFocused ? 'ring-2 ring-fmat-primary' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-x-2 gap-y-1 w-full flex-wrap min-w-0">
          <div className="flex items-baseline gap-1.5 shrink-0 whitespace-nowrap min-w-0">
            <TableHeader
              tableNumber={order.tableNumber}
              isTakeaway={order.isTakeaway}
              displayId={displayId}
              isCompact={isCompact}
            />
            {hasTableHeader && (
              <span className="text-white/80 font-mono font-bold text-sm">·</span>
            )}
            <span
              className={`${
                isCompact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
              } font-bold font-mono tracking-wider text-white shrink-0`}
              data-testid={`order-id-${displayId}`}
              title={`#${displayId}`}
            >
              #{orderNumberDisplay}
              <span className="sr-only">#{displayId}</span>
            </span>
          </div>

          <div
            data-testid={`order-status-${displayId}`}
            className="flex items-center gap-1.5 shrink-0 ml-auto"
          >
            <StatusBadge status={order.status} />
            <span className="sr-only">{order.status}</span>
          </div>
        </div>

        {/* Live Stopwatch & Semáforo */}
        <div className={`flex items-center justify-between w-full ${isCompact ? 'mt-1' : 'mt-1.5 sm:mt-2'}`}>
          <div
            data-testid={`order-stopwatch-${displayId}`}
            data-delay-status={delayStatus}
            className={`inline-flex items-center gap-1.5 ${
              isCompact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 sm:py-1 text-xs sm:text-sm'
            } rounded-md font-mono font-bold shadow-sm whitespace-nowrap shrink-0 flex-nowrap ${
              delayStatus === 'warning' ? 'text-gray-950 font-black' : 'text-white'
            }`}
            style={{ backgroundColor: delayColorToken }}
            aria-label={`Tiempo transcurrido: ${formattedTime}, estado: ${delayLabel}`}
          >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"
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
              className="text-[11px] sm:text-xs uppercase tracking-wider opacity-95"
            >
              ({delayLabel})
            </span>
          </div>
        </div>
      </button>

      {/* Dish Items List */}
      <ul
        data-testid={`order-items-list-${displayId}`}
        className="flex-1 min-h-[120px] list-none m-0 px-3 sm:px-4 my-1 overflow-y-auto divide-y divide-border bg-surface scrollbar-thin scrollbar-thumb-gray-300"
        aria-label={`Platillos para la comanda ${displayId}`}
      >
        {order.items.map((item, index) => {
          const itemId = getItemKey(item, index);
          const isRedoPending = order.status === 'DELIVERED' && item.status === 'PENDING';
          const isPendingUndo = pendingUndoItem?.itemId === itemId;
          const isOptimisticallyReady =
            Boolean(optimisticReadyItemIds?.has(itemId)) ||
            (isPendingUndoOrder &&
              (pendingOrderTriggeringItemId ? pendingOrderTriggeringItemId === itemId : true));
          return (
            <OrderCardItem
              key={itemId}
              item={item}
              index={index}
              onReady={() => onItemReady?.(order, item)}
              onUndo={() => onUndoReady?.(order, item)}
              onRejectSupplies={() => onRejectSupplies?.(order, item)}
              isPending={pendingAction === `item:${itemId}`}
              isRedoPending={isRedoPending}
              isPendingUndo={isPendingUndo}
              isOptimisticallyReady={isOptimisticallyReady}
              undoSecondsLeft={pendingUndoItem?.secondsLeft}
              isManyItems={isManyItems}
              isCompact={isCompact}
              isReadOnlyExpired={isOrderExpired}
            />
          );
        })}
      </ul>

      {/* Footer info: Total items count - clickable to open expanded view */}
      <button
        type="button"
        data-testid={`order-card-footer-${displayId}`}
        aria-label={`Ver detalles completos de la comanda ${orderNumberDisplay}`}
        onClick={() => onClick?.(order)}
        className={`shrink-0 w-full ${
          isCompact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        } border-t border-border flex items-center justify-between text-muted bg-gray-50/50 hover:bg-gray-100 transition-colors text-left focus:outline-none focus:ring-1 focus:ring-fmat-primary border-0 cursor-pointer select-none`}
      >
        <span className="font-medium whitespace-nowrap">
          {order.items.length} {order.items.length === 1 ? 'platillo' : 'platillos'}
        </span>
        <span className="truncate ml-2 text-right">Toca o Enter para detalles</span>
      </button>

      <OrderCardActions
        order={order}
        displayId={displayId}
        pendingAction={pendingAction}
        userRole={userRole}
        isCompact={isCompact}
        onStartPreparation={onStartPreparation}
        onRejectSupplies={onRejectSupplies}
        onAdminVoid={onAdminVoid}
        onChefVoid={onChefVoid}
        onMarkOrderReady={onMarkOrderReady}
        isPendingUndoOrder={isPendingUndoOrder}
        undoOrderSecondsLeft={undoOrderSecondsLeft}
        onUndoOrderReady={onUndoOrderReady}
        ttlStatus={ttlStatus}
        isExpiredTab={isExpiredTab}
      />
    </article>
  );
}

export default OrderCard;
