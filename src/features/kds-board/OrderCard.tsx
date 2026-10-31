import type { KeyboardEvent } from 'react';
import type { Order, OrderItem } from '../../shared/api/schemas.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { useElapsedTime } from './useElapsedTime.ts';

export interface OrderCardProps {
  readonly order: Order;
  readonly onClick?: (order: Order) => void;
  readonly isFocused?: boolean;
}

/**
 * Renders a single dish item inside an order card.
 * Notes, modifiers and preparationTimeText are safely escaped by React (ST-19 / XSS prevention).
 */
function OrderCardItem({ item, index }: Readonly<{ item: OrderItem; index: number }>) {
  const itemId = item.id ?? item.itemId ?? item.publicId ?? `item-${index}`;
  const prepTime = item.preparationTimeText ?? item.preparation_time_text ?? null;

  return (
    <li
      data-testid={`order-item-${itemId}`}
      className="py-2 border-b border-gray-700/50 last:border-b-0 flex flex-col gap-1"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span
            className="text-lg font-black text-amber-400 min-w-[28px]"
            data-testid={`order-item-qty-${itemId}`}
          >
            {item.quantity}x
          </span>
          <span
            className="text-lg font-bold text-gray-100 leading-tight"
            data-testid={`order-item-name-${itemId}`}
          >
            {item.name}
          </span>
        </div>

        {prepTime && (
          <span
            className="text-xs font-mono font-semibold text-gray-400 bg-gray-900/80 px-2 py-0.5 rounded shrink-0"
            data-testid={`order-item-prep-time-${itemId}`}
          >
            {prepTime}
          </span>
        )}
      </div>

      {item.modifiers && item.modifiers.length > 0 && (
        <div
          className="pl-8 flex flex-wrap gap-1.5 mt-0.5"
          data-testid={`order-item-modifiers-${itemId}`}
        >
          {item.modifiers.map((modifier, modIdx) => (
            <span
              key={`${itemId}-mod-${modIdx}`}
              className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-700/80 text-amber-200 border border-amber-400/30"
              data-testid={`order-item-modifier-${itemId}-${modIdx}`}
            >
              + {modifier}
            </span>
          ))}
        </div>
      )}

      {item.notes && (
        <div
          className="pl-8 text-sm text-yellow-300 italic flex items-start gap-1"
          data-testid={`order-item-notes-${itemId}`}
        >
          <span className="font-bold not-italic shrink-0">Note:</span>
          <span className="break-words">{item.notes}</span>
        </div>
      )}
    </li>
  );
}

/**
 * Production-ready OrderCard component for the KDS (TASK-15 Phase 2).
 * Displays large table number, order ID, live delay stopwatch (OP-11), StatusBadge,
 * and high-contrast kitchen items list.
 */
export function OrderCard({
  order,
  onClick,
  isFocused = false,
}: Readonly<OrderCardProps>) {
  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';

  // OP-11: Live stopwatch starts strictly from `in_preparation_at` or `inPreparationAt`, NEVER from `createdAt`.
  const inPrepAt = order.in_preparation_at ?? order.inPreparationAt ?? null;
  const { formattedTime, delayStatus, delayLabel, delayColorToken } = useElapsedTime(inPrepAt);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(order);
    }
  };

  const hasTable = order.tableNumber !== null && order.tableNumber !== undefined;

  let tableHeaderContent = null;
  if (hasTable) {
    tableHeaderContent = (
      <span
        className="text-2xl font-black text-white tracking-wide"
        data-testid={`order-table-${displayId}`}
      >
        Table {order.tableNumber}
      </span>
    );
  } else if (order.isTakeaway) {
    tableHeaderContent = (
      <span
        className="text-xl font-black text-amber-300 uppercase tracking-wider"
        data-testid={`order-takeaway-${displayId}`}
      >
        Takeaway
      </span>
    );
  }

  return (
    <article
      data-testid={`order-card-${displayId}`}
      aria-label={`Order ${displayId}`}
      className="h-full flex flex-col"
    >
      <button
        type="button"
        data-testid={`order-card-stub-${displayId}`}
        aria-label={`Order ${displayId}`}
        onClick={() => onClick?.(order)}
        onKeyDown={handleKeyDown}
        className={`w-full h-full p-5 rounded-fmat border transition-all duration-150 select-none cursor-pointer flex flex-col justify-between min-h-[220px] text-left ${
          isFocused
            ? 'bg-gray-800 border-fmat-primary ring-2 ring-fmat-primary shadow-xl'
            : 'bg-gray-800/95 border-gray-700 hover:border-gray-500 shadow-md'
        } focus:outline-none focus:ring-2 focus:ring-fmat-primary`}
      >
        {/* Card Header: Table Number / Takeaway, Order ID, StatusBadge */}
        <div className="w-full pb-3 border-b border-gray-700 flex flex-col gap-2">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {tableHeaderContent}
              <span
                className="text-lg font-bold font-mono tracking-wider text-gray-300"
                data-testid={`order-id-${displayId}`}
              >
                #{displayId}
              </span>
            </div>

            <div
              data-testid={`order-status-${displayId}`}
              className="flex items-center gap-1.5"
            >
              <StatusBadge status={order.status} />
              <span className="sr-only">{order.status}</span>
            </div>
          </div>

          {/* Live Stopwatch & Semáforo */}
          <div className="flex items-center justify-between w-full mt-1">
            <div
              data-testid={`order-stopwatch-${displayId}`}
              data-delay-status={delayStatus}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-md font-mono text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: delayColorToken }}
              aria-label={`Elapsed time: ${formattedTime}, status: ${delayLabel}`}
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
        </div>

        {/* Dish Items List */}
        <ul
          data-testid={`order-items-list-${displayId}`}
          className="flex-1 my-3 overflow-y-auto divide-y divide-gray-700/50 pr-1 max-h-[300px]"
          aria-label={`Items for order ${displayId}`}
        >
          {order.items.map((item, index) => (
            <OrderCardItem
              key={item.id ?? item.itemId ?? item.publicId ?? `item-${index}`}
              item={item}
              index={index}
            />
          ))}
        </ul>

        {/* Footer info: Total items count */}
        <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between text-xs text-gray-400 w-full">
          <span>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
          <span>Click to select</span>
        </div>
      </button>
    </article>
  );
}

export default OrderCard;

