import type { OrderStatus } from '../../shared/types/order.ts';
import { STATUS_CONFIG } from './orderStatusConfig.ts';

export interface StatusBadgeProps {
  readonly status: OrderStatus;
  readonly className?: string;
}

/**
 * Token-based status badge mapping all 9 domain order statuses to semantic tokens (TASK-C08).
 * Ensures accessible, high-contrast visual status cues with both text and semantic background.
 */
export function StatusBadge({ status, className = '' }: Readonly<StatusBadgeProps>) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    token: 'var(--color-info)',
    className: 'bg-info text-white',
  };

  return (
    <span
      data-testid={`status-badge-${status.toLowerCase()}`}
      data-status={status}
      style={{ backgroundColor: config.token }}
      className={`inline-flex items-center justify-center px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wider shadow-sm select-none whitespace-nowrap shrink-0 ${config.className} ${className}`.trim()}
    >
      {config.label}
      {config.englishLabel && (
        <span className="sr-only"> {config.englishLabel}</span>
      )}
    </span>
  );
}

export default StatusBadge;
