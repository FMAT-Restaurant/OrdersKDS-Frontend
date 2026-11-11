import type React from 'react';
import type { Order } from '../../shared/api/schemas.ts';
import type { PendingUndoItem } from './OrderCard.tsx';

/**
 * In-memory reference entry for an active countdown grace window.
 */
export interface PendingUndoRefEntry {
  timerId: ReturnType<typeof setTimeout> | null;
  intervalId: ReturnType<typeof setInterval> | null;
  type: 'item' | 'order';
  order: Order;
  item?: Order['items'][number];
  execute: () => Promise<void>;
}

/**
 * Parameters required to register a grace period countdown for an item or whole order.
 */
export interface RegisterGracePeriodParams {
  orderId: string;
  itemId?: string;
  type: 'item' | 'order';
  order: Order;
  item?: Order['items'][number];
  graceMs: number;
  execute: () => Promise<void>;
  pendingUndoRefs: React.RefObject<Map<string, PendingUndoRefEntry>>;
  setPendingUndoMap: React.Dispatch<React.SetStateAction<Record<string, PendingUndoItem>>>;
}

/**
 * Registers an optimistic countdown timer and interval for a pending undoable action.
 *
 * Decrements the displayed seconds left every second, and executes the underlying
 * action automatically when the timer reaches zero without user cancellation.
 *
 * @param params Parameters configuring the countdown and action execution.
 */
export function registerGracePeriodCountdown({
  orderId,
  itemId,
  type,
  order,
  item,
  graceMs,
  execute,
  pendingUndoRefs,
  setPendingUndoMap,
}: RegisterGracePeriodParams): void {
  const totalSeconds = Math.max(1, Math.ceil(graceMs / 1000));

  setPendingUndoMap((prev) => ({
    ...prev,
    [orderId]: {
      orderId,
      itemId,
      type,
      secondsLeft: totalSeconds,
    },
  }));

  const intervalId = setInterval(() => {
    setPendingUndoMap((prev) => {
      const current = prev[orderId];
      if (current?.type !== type) return prev;
      if (type === 'item' && current.itemId !== itemId) return prev;
      return {
        ...prev,
        [orderId]: {
          ...current,
          secondsLeft: Math.max(0, current.secondsLeft - 1),
        },
      };
    });
  }, 1000);

  const timerId = setTimeout(async () => {
    const currentRef = pendingUndoRefs.current.get(orderId);
    if (currentRef?.type === type) {
      clearInterval(intervalId);
      pendingUndoRefs.current.delete(orderId);
      setPendingUndoMap((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await execute();
    }
  }, graceMs);

  pendingUndoRefs.current.set(orderId, {
    timerId,
    intervalId,
    type,
    order,
    item,
    execute,
  });
}

