import type { Order } from '../../shared/api/schemas.ts';

/**
 * Hardcoded TTL for reserved orders awaiting start of preparation in KDS (15 minutes).
 */
export const KDS_RESERVED_ORDER_TTL_MS = 15 * 60 * 1000;

/**
 * Grace window (1 minute = 60,000 ms) during which an expired reserved order remains
 * visible on the KDS board with "Iniciar preparación" disabled before being removed.
 */
export const KDS_EXPIRED_GRACE_MS = 60 * 1000;

export interface OrderTtlStatus {
  readonly isExpired: boolean;
  readonly isCompletelyEliminated: boolean;
  readonly secondsUntilRemoval: number;
}

/**
 * Calculates the TTL status of a reserved order in KDS.
 *
 * Rules:
 * 1. For orders in 'RESERVED' status, checks time elapsed since reservation/confirmation.
 * 2. If elapsed >= ttlMs, marked as `isExpired: true`. During this window, "Iniciar preparación"
 *    must be blocked, warning the kitchen.
 * 3. After ttlMs + graceMs (1 minute), marked as `isCompletelyEliminated: true` and removed
 *    from the KDS display.
 */
export function getOrderTtlStatus(
  order: Order,
  nowMs: number = Date.now(),
  ttlMs: number = KDS_RESERVED_ORDER_TTL_MS,
  graceMs: number = KDS_EXPIRED_GRACE_MS,
): OrderTtlStatus {
  if (order.status === 'EXPIRED') {
    return {
      isExpired: true,
      isCompletelyEliminated: true,
      secondsUntilRemoval: 0,
    };
  }

  if (order.status !== 'RESERVED') {
    return {
      isExpired: false,
      isCompletelyEliminated: false,
      secondsUntilRemoval: 0,
    };
  }

  const rawTimestamp =
    order.stock_reserved_at ??
    order.stockReservedAt;

  if (!rawTimestamp) {
    return {
      isExpired: false,
      isCompletelyEliminated: false,
      secondsUntilRemoval: 0,
    };
  }

  const parsedTime = new Date(rawTimestamp).getTime();
  if (Number.isNaN(parsedTime)) {
    return {
      isExpired: false,
      isCompletelyEliminated: false,
      secondsUntilRemoval: 0,
    };
  }

  const elapsedMs = Math.max(0, nowMs - parsedTime);
  const isExpired = elapsedMs >= ttlMs;
  const isCompletelyEliminated = elapsedMs >= ttlMs + graceMs;
  const remainingGraceMs = Math.max(0, ttlMs + graceMs - elapsedMs);
  const secondsUntilRemoval = isExpired ? Math.ceil(remainingGraceMs / 1000) : 0;

  return {
    isExpired,
    isCompletelyEliminated,
    secondsUntilRemoval,
  };
}
