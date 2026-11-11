import type { KeyboardEvent } from 'react';
import type { Order } from '../../shared/api/schemas.ts';

export interface OrderCardStubProps {
  readonly order: Order;
  readonly onClick?: (order: Order) => void;
  readonly isFocused?: boolean;
}

/**
 * Temporary stub component representing an order in the KDS visual grid.
 *
 * NOTE: As per TASK-15 constraints, this stub only renders the order ID and its status.
 * Uses semantic HTML5 <article> and interactive <button> for keyboard/touch activation.
 */
export function OrderCardStub({
  order,
  onClick,
  isFocused = false,
}: Readonly<OrderCardStubProps>) {
  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(displayId);
  const orderNumberDisplay =
    order.orderNumber != null
      ? String(order.orderNumber)
      : isUuid
      ? displayId.slice(-4).toUpperCase()
      : displayId.replace(/^ord-/, '');

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(order);
    }
  };

  return (
    <article
      data-testid={`order-card-stub-article-${displayId}`}
      aria-label={`Order ${displayId}`}
      className="h-full"
    >
      <button
        type="button"
        data-testid={`order-card-stub-${displayId}`}
        aria-label={`Order ${displayId}`}
        onClick={() => onClick?.(order)}
        onKeyDown={handleKeyDown}
        className={`w-full h-full p-5 rounded-fmat border transition-all duration-150 select-none cursor-pointer flex flex-col justify-between min-h-[160px] text-left ${
          isFocused
            ? 'bg-surface border-fmat-primary ring-2 ring-fmat-primary shadow-md'
            : 'bg-surface/90 border-border hover:border-gray-400 shadow-sm'
        } focus:outline-none focus:ring-2 focus:ring-fmat-primary`}
      >
        <div className="flex items-center justify-between w-full">
          <span
            className="text-2xl font-bold font-mono tracking-wider text-ink"
            data-testid={`order-id-${displayId}`}
          >
            #{orderNumberDisplay}
            <span className="sr-only">#{displayId}</span>
          </span>
          {order.tableNumber !== null && order.tableNumber !== undefined && (
            <span
              className="text-sm font-semibold text-body bg-gray-100 px-2.5 py-1 rounded border border-border whitespace-nowrap"
              data-testid={`order-table-${displayId}`}
            >
              Mesa {order.tableNumber}
              <span className="sr-only"> Table {order.tableNumber}</span>
            </span>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-base w-full">
          <span className="text-muted font-medium">Status</span>
          <span
            className="font-bold uppercase tracking-wide text-body"
            data-testid={`order-status-${displayId}`}
          >
            {order.status}
          </span>
        </div>
      </button>
    </article>
  );
}
