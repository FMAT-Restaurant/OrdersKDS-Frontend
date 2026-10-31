import type { KeyboardEvent } from 'react';
import type { Order } from '../../shared/api/schemas.ts';

export interface OrderCardStubProps {
  order: Order;
  onClick?: (order: Order) => void;
  isFocused?: boolean;
}

/**
 * Temporary stub component representing an order in the KDS visual grid.
 *
 * NOTE: As per TASK-15 constraints, this stub only renders the order ID and its status.
 * Implementation of the final OrderCard, StatusBadge, and delay stopwatch is forbidden in this phase.
 */
export function OrderCardStub({ order, onClick, isFocused = false }: OrderCardStubProps) {
  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(order);
    }
  };

  return (
    <div
      role="article"
      data-testid={`order-card-stub-${displayId}`}
      aria-label={`Order ${displayId}`}
      tabIndex={0}
      onClick={() => onClick?.(order)}
      onKeyDown={handleKeyDown}
      className={`p-5 rounded-fmat border transition-all duration-150 select-none cursor-pointer flex flex-col justify-between min-h-[160px] ${
        isFocused
          ? 'bg-gray-800 border-fmat-primary ring-2 ring-fmat-primary shadow-lg'
          : 'bg-gray-800/95 border-gray-700 hover:border-gray-500 shadow'
      } focus:outline-none focus:ring-2 focus:ring-fmat-primary`}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-2xl font-bold font-mono tracking-wider text-white"
          data-testid={`order-id-${displayId}`}
        >
          #{displayId}
        </span>
        {order.tableNumber !== null && order.tableNumber !== undefined && (
          <span
            className="text-sm font-semibold text-gray-300 bg-gray-700/80 px-2.5 py-1 rounded"
            data-testid={`order-table-${displayId}`}
          >
            Table {order.tableNumber}
          </span>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-700/60 flex items-center justify-between text-base">
        <span className="text-gray-400 font-medium">Status</span>
        <span
          className="font-bold uppercase tracking-wide text-gray-200"
          data-testid={`order-status-${displayId}`}
        >
          {order.status}
        </span>
      </div>
    </div>
  );
}

