import type React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Order } from '../../../src/shared/api/schemas.ts';
import type { PendingUndoItem } from '../../../src/features/kds-board/OrderCard.tsx';
import {
  type PendingUndoRefEntry,
  registerGracePeriodCountdown,
} from '../../../src/features/kds-board/kdsGracePeriod.ts';

const mockOrder: Order = {
  id: 'order-123',
  publicId: 'order-123',
  orderNumber: 101,
  tableNumber: 4,
  status: 'IN_PREPARATION',
  version: 1,
  items: [
    {
      id: 'item-1',
      publicId: 'item-1',
      name: 'Tacos al Pastor',
      quantity: 2,
      unitPrice: '120.00',
      status: 'PENDING',
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('registerGracePeriodCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers item grace period and decrements secondsLeft each second until completion', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const pendingUndoRefs = {
      current: new Map<string, PendingUndoRefEntry>(),
    };
    let stateMap: Record<string, PendingUndoItem> = {};
    const setPendingUndoMap: React.Dispatch<React.SetStateAction<Record<string, PendingUndoItem>>> = vi.fn(
      (action: React.SetStateAction<Record<string, PendingUndoItem>>) => {
        stateMap = typeof action === 'function' ? action(stateMap) : action;
      },
    );

    registerGracePeriodCountdown({
      orderId: 'order-123',
      itemId: 'item-1',
      type: 'item',
      order: mockOrder,
      item: mockOrder.items[0],
      graceMs: 15000,
      execute,
      pendingUndoRefs,
      setPendingUndoMap,
    });

    // Initial state check
    expect(stateMap['order-123']).toEqual({
      orderId: 'order-123',
      itemId: 'item-1',
      type: 'item',
      secondsLeft: 15,
    });
    expect(pendingUndoRefs.current.has('order-123')).toBe(true);

    // Advance 1 second
    vi.advanceTimersByTime(1000);
    expect(stateMap['order-123']?.secondsLeft).toBe(14);

    // Advance remaining 14 seconds to trigger execution
    await vi.advanceTimersByTimeAsync(14000);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(pendingUndoRefs.current.has('order-123')).toBe(false);
    expect(stateMap['order-123']).toBeUndefined();
  });

  it('registers order grace period and executes when graceMs expires', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const pendingUndoRefs = {
      current: new Map<string, PendingUndoRefEntry>(),
    };
    let stateMap: Record<string, PendingUndoItem> = {};
    const setPendingUndoMap: React.Dispatch<React.SetStateAction<Record<string, PendingUndoItem>>> = vi.fn(
      (action: React.SetStateAction<Record<string, PendingUndoItem>>) => {
        stateMap = typeof action === 'function' ? action(stateMap) : action;
      },
    );

    registerGracePeriodCountdown({
      orderId: 'order-123',
      type: 'order',
      order: mockOrder,
      graceMs: 5000,
      execute,
      pendingUndoRefs,
      setPendingUndoMap,
    });

    expect(stateMap['order-123']?.secondsLeft).toBe(5);
    expect(stateMap['order-123']?.type).toBe('order');

    vi.advanceTimersByTime(2000);
    expect(stateMap['order-123']?.secondsLeft).toBe(3);

    await vi.advanceTimersByTimeAsync(3000);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(stateMap['order-123']).toBeUndefined();
  });

  it('ignores interval tick if entry is missing or has a different type or different itemId', () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const pendingUndoRefs = {
      current: new Map<string, PendingUndoRefEntry>(),
    };
    let stateMap: Record<string, PendingUndoItem> = {};
    const setPendingUndoMap: React.Dispatch<React.SetStateAction<Record<string, PendingUndoItem>>> = vi.fn(
      (action: React.SetStateAction<Record<string, PendingUndoItem>>) => {
        stateMap = typeof action === 'function' ? action(stateMap) : action;
      },
    );

    registerGracePeriodCountdown({
      orderId: 'order-123',
      itemId: 'item-1',
      type: 'item',
      order: mockOrder,
      item: mockOrder.items[0],
      graceMs: 10000,
      execute,
      pendingUndoRefs,
      setPendingUndoMap,
    });

    // Simulate entry mutated to a different type
    stateMap['order-123'] = {
      orderId: 'order-123',
      type: 'order',
      secondsLeft: 10,
    };
    vi.advanceTimersByTime(1000);
    expect(stateMap['order-123']?.secondsLeft).toBe(10);

    // Simulate entry with different itemId
    stateMap['order-123'] = {
      orderId: 'order-123',
      itemId: 'item-999',
      type: 'item',
      secondsLeft: 10,
    };
    vi.advanceTimersByTime(1000);
    expect(stateMap['order-123']?.secondsLeft).toBe(10);

    // Simulate entry deleted from stateMap
    delete stateMap['order-123'];
    vi.advanceTimersByTime(1000);
    expect(stateMap['order-123']).toBeUndefined();
  });

  it('does not execute if ref entry type was changed or deleted before timeout', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const pendingUndoRefs = {
      current: new Map<string, PendingUndoRefEntry>(),
    };
    let stateMap: Record<string, PendingUndoItem> = {};
    const setPendingUndoMap: React.Dispatch<React.SetStateAction<Record<string, PendingUndoItem>>> = vi.fn(
      (action: React.SetStateAction<Record<string, PendingUndoItem>>) => {
        stateMap = typeof action === 'function' ? action(stateMap) : action;
      },
    );

    registerGracePeriodCountdown({
      orderId: 'order-123',
      itemId: 'item-1',
      type: 'item',
      order: mockOrder,
      item: mockOrder.items[0],
      graceMs: 5000,
      execute,
      pendingUndoRefs,
      setPendingUndoMap,
    });

    // Delete ref before timeout completes
    pendingUndoRefs.current.delete('order-123');

    await vi.advanceTimersByTimeAsync(5000);
    expect(execute).not.toHaveBeenCalled();
  });
});
