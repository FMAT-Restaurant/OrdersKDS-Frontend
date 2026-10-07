/**
 * Mirror of shared domain types from the backend.
 * Synchronize with `app/domain/order_status.py` (backend) when evolving.
 *
 * Source of truth: TASK-03 — PostgreSQL modeling and state machine.
 * The 9 order states and 3 item states are those defined
 * in `_ALLOWED_TRANSITIONS` on the backend.
 *
 * Note: the `const + as const + type` pattern is used instead of `enum`
 * because tsconfig has `erasableSyntaxOnly: true`, which forbids
 * constructs that require code emission (not just type stripping).
 */

/** State values for an order. */
export const OrderStatus = {
  CREATED:        'CREATED',
  IN_PREPARATION: 'IN_PREPARATION',
  DELIVERED:      'DELIVERED',
  PAID:           'PAID',
  CANCELLED:      'CANCELLED',
  REJECTED:       'REJECTED',
  WASTED:         'WASTED',
  VOIDED:         'VOIDED',
  EXPIRED:        'EXPIRED',
} as const;

/** Union type of all possible order states. */
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

/** State values for an individual item within an order. */
export const ItemStatus = {
  PENDING:   'PENDING',
  READY:     'READY',
  DELIVERED: 'DELIVERED',
} as const;

/** Union type of all possible item states. */
export type ItemStatus = typeof ItemStatus[keyof typeof ItemStatus];

