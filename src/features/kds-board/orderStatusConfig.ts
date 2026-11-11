import type { OrderStatus } from '../../shared/types/order.ts';

export interface StatusConfig {
  readonly label: string;
  readonly englishLabel?: string;
  readonly token: string;
  readonly className: string;
}

/**
 * Token-based status configuration mapping domain order statuses to semantic tokens (TASK-C08, ADR-0012).
 * Ensures accessible, high-contrast visual status cues with both text and semantic background.
 */
export const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  CREATED: {
    label: 'Creada',
    englishLabel: 'Created',
    token: 'var(--color-warning)',
    className: 'bg-warning text-white',
  },
  RESERVED: {
    label: 'Por iniciar',
    englishLabel: 'Por iniciar',
    token: 'var(--color-info)',
    className: 'bg-info text-white',
  },
  IN_PREPARATION: {
    label: 'En preparación',
    englishLabel: 'In Preparation',
    token: 'var(--color-info)',
    className: 'bg-info text-white',
  },
  DELIVERED: {
    label: 'Entregada',
    englishLabel: 'Delivered',
    token: 'var(--color-success)',
    className: 'bg-success text-white',
  },
  PAID: {
    label: 'Pagada',
    englishLabel: 'Paid',
    token: 'var(--color-success)',
    className: 'bg-success text-white',
  },
  CANCELLED: {
    label: 'Cancelada',
    englishLabel: 'Cancelled',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  REJECTED: {
    label: 'Rechazada',
    englishLabel: 'Rejected',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  WASTED: {
    label: 'Mermada',
    englishLabel: 'Wasted',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  VOIDED: {
    label: 'Anulada',
    englishLabel: 'Voided',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
  EXPIRED: {
    label: 'Expirada',
    englishLabel: 'Expired',
    token: 'var(--color-error)',
    className: 'bg-error text-white',
  },
};
