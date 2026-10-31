import type { OrderStatus } from '../../shared/types/order.ts';

export interface StatusConfig {
  readonly label: string;
  readonly token: string;
  readonly className: string;
}

/**
 * Token-based status configuration mapping all 9 domain order statuses to semantic tokens (TASK-C08).
 * Ensures accessible, high-contrast visual status cues with both text and semantic background.
 */
export const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  CREATED: {
    label: 'Created',
    token: 'var(--color-warning)',
    className: 'bg-warning text-white',
  },
  IN_PREPARATION: {
    label: 'In Preparation',
    token: 'var(--color-info)',
    className: 'bg-info text-white',
  },
  DELIVERED: {
    label: 'Delivered',
    token: 'var(--color-success)',
    className: 'bg-success text-white',
  },
  PAID: {
    label: 'Paid',
    token: 'var(--color-success)',
    className: 'bg-success text-white',
  },
  CANCELLED: {
    label: 'Cancelled',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  REJECTED: {
    label: 'Rejected',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  WASTED: {
    label: 'Wasted',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  VOIDED: {
    label: 'Voided',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  EXPIRED: {
    label: 'Expired',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
};

