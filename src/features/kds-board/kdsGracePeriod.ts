import type React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Order } from '../../shared/api/schemas.ts';
import { getItemKey } from './orderNumberDisplay.ts';
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

/** Summary of an active persistent countdown entry for UI rendering and cross-tab visibility. */
export interface PersistentGraceSummary {
  readonly orderId: string;
  readonly itemId?: string;
  readonly type: 'item' | 'order';
  readonly order: Order;
  readonly item?: Order['items'][number];
  readonly secondsLeft: number;
}

/** UI feedback notice broadcast safely across KdsBoard remounts. */
export interface KdsGraceFeedbackNotice {
  readonly text: string;
  readonly type: 'success' | 'info' | 'error';
}

/** Immutable snapshot exposed by KdsGracePeriodStore. */
export interface GracePeriodSnapshot {
  readonly pendingUndoMap: Record<string, PendingUndoItem>;
  readonly activeEntries: readonly PersistentGraceSummary[];
  readonly optimisticReadyItemIds: Set<string>;
}

interface StoredGraceEntry {
  readonly orderId: string;
  readonly itemId?: string;
  readonly type: 'item' | 'order';
  readonly order: Order;
  readonly item?: Order['items'][number];
  readonly expiresAtMs: number;
  readonly timerId: ReturnType<typeof setTimeout>;
  readonly execute: () => Promise<void | boolean>;
}

const EMPTY_SNAPSHOT: GracePeriodSnapshot = {
  pendingUndoMap: {},
  activeEntries: [],
  optimisticReadyItemIds: new Set<string>(),
};

/**
 * QueryClient-scoped store preserving KDS undo grace timers across tab switches and view remounts.
 */
export class KdsGracePeriodStore {
  private readonly entries = new Map<string, StoredGraceEntry>();
  private readonly optimisticItemIds = new Set<string>();
  private readonly completedVersionByItemId = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly noticeListeners = new Set<(notice: KdsGraceFeedbackNotice) => void>();
  private tickIntervalId: ReturnType<typeof setInterval> | null = null;
  private snapshot: GracePeriodSnapshot = EMPTY_SNAPSHOT;

  getSnapshot(): GracePeriodSnapshot {
    return this.snapshot;
  }

  getEntry(orderId: string): PersistentGraceSummary | undefined {
    const entry = this.entries.get(orderId);
    if (!entry) return undefined;
    return this.toSummary(entry, Date.now());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeNotices(listener: (notice: KdsGraceFeedbackNotice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  emitNotice(notice: KdsGraceFeedbackNotice): void {
    for (const listener of this.noticeListeners) {
      listener(notice);
    }
  }

  register(params: {
    readonly orderId: string;
    readonly itemId?: string;
    readonly type: 'item' | 'order';
    readonly order: Order;
    readonly item?: Order['items'][number];
    readonly graceMs: number;
    readonly execute: () => Promise<void | boolean>;
  }): void {
    const { orderId, itemId, type, order, item, graceMs, execute } = params;
    const existing = this.entries.get(orderId);
    if (existing) {
      clearTimeout(existing.timerId);
      if (existing.itemId && existing.itemId !== itemId) {
        this.optimisticItemIds.delete(existing.itemId);
      }
      this.entries.delete(orderId);
    }

    if (itemId) {
      this.optimisticItemIds.add(itemId);
      this.completedVersionByItemId.delete(itemId);
    }

    const expiresAtMs = Date.now() + graceMs;
    const timerId = setTimeout(() => {
      void this.completeExpiredEntry(orderId, type, timerId);
    }, graceMs);

    this.entries.set(orderId, {
      orderId,
      itemId,
      type,
      order,
      item,
      expiresAtMs,
      timerId,
      execute,
    });

    this.syncTicker();
    this.updateSnapshotAndNotify();
  }

  cancel(orderId?: string): PersistentGraceSummary | null {
    const resolvedKey = orderId ?? Array.from(this.entries.keys()).at(-1);
    if (!resolvedKey) return null;

    const current = this.entries.get(resolvedKey);
    if (!current) return null;

    const summary = this.toSummary(current, Date.now());
    clearTimeout(current.timerId);
    this.entries.delete(resolvedKey);
    if (current.itemId) {
      this.optimisticItemIds.delete(current.itemId);
      this.completedVersionByItemId.delete(current.itemId);
    }

    this.syncTicker();
    this.updateSnapshotAndNotify();
    return summary;
  }

  cancelOrderForEscalation(orderId: string): (() => Promise<void>) | null {
    const existing = this.entries.get(orderId);
    if (!existing) return null;

    clearTimeout(existing.timerId);
    this.entries.delete(orderId);
    this.syncTicker();
    this.updateSnapshotAndNotify();

    if (existing.type === 'item') {
      return () => this.runAndReleaseOptimisticItem(existing);
    }
    return null;
  }

  async flushByType(type: 'item' | 'order'): Promise<void> {
    const toFlush: StoredGraceEntry[] = [];
    for (const [key, entry] of this.entries.entries()) {
      if (entry.type === type) {
        clearTimeout(entry.timerId);
        this.entries.delete(key);
        toFlush.push(entry);
      }
    }
    if (toFlush.length === 0) return;

    this.syncTicker();
    this.updateSnapshotAndNotify();
    await Promise.all(toFlush.map((entry) => this.runAndReleaseOptimisticItem(entry)));
  }

  flushAll(): void {
    if (this.entries.size === 0) return;
    const allEntries = Array.from(this.entries.values());
    for (const entry of allEntries) {
      clearTimeout(entry.timerId);
    }
    this.entries.clear();
    this.syncTicker();
    this.updateSnapshotAndNotify();
    for (const entry of allEntries) {
      void this.runAndReleaseOptimisticItem(entry);
    }
  }

  reconcileOrders(orders: readonly Order[]): void {
    if (this.completedVersionByItemId.size === 0) return;
    const itemLookup = new Map<string, { readonly status?: string; readonly version: number }>();
    for (const order of orders) {
      const orderVersion = order.version ?? 0;
      order.items.forEach((item, index) => {
        const key = getItemKey(item, index);
        if (key) {
          itemLookup.set(key, { status: item.status, version: orderVersion });
        }
      });
    }

    let changed = false;
    for (const [itemId, committedVersion] of this.completedVersionByItemId.entries()) {
      const fresh = itemLookup.get(itemId);
      const isAlreadyFinished = fresh?.status === 'READY' || fresh?.status === 'DELIVERED';
      const isReopenedForRedo =
        fresh?.status === 'PENDING' && fresh.version > committedVersion;
      if (isAlreadyFinished || isReopenedForRedo) {
        this.completedVersionByItemId.delete(itemId);
        this.optimisticItemIds.delete(itemId);
        changed = true;
      }
    }
    if (changed) {
      this.updateSnapshotAndNotify();
    }
  }

  private async completeExpiredEntry(
    orderId: string,
    expectedType: 'item' | 'order',
    expectedTimerId: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    const current = this.entries.get(orderId);
    if (!current || current.type !== expectedType || current.timerId !== expectedTimerId) {
      return;
    }
    this.entries.delete(orderId);
    this.syncTicker();
    this.updateSnapshotAndNotify();
    await this.runAndReleaseOptimisticItem(current);
  }

  private async runAndReleaseOptimisticItem(entry: StoredGraceEntry): Promise<void> {
    let succeeded: boolean;
    try {
      succeeded = (await entry.execute()) !== false;
    } catch {
      succeeded = false;
    }
    if (!entry.itemId) return;

    if (succeeded && !this.entries.has(entry.orderId)) {
      this.completedVersionByItemId.set(entry.itemId, entry.order.version ?? 0);
    } else if (!succeeded) {
      this.optimisticItemIds.delete(entry.itemId);
      this.completedVersionByItemId.delete(entry.itemId);
    }
    this.updateSnapshotAndNotify();
  }

  private syncTicker(): void {
    if (this.entries.size === 0 && this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
      return;
    }
    if (this.entries.size > 0 && this.tickIntervalId === null) {
      this.tickIntervalId = setInterval(() => {
        this.updateSnapshotAndNotify();
      }, 1000);
    }
  }

  private toSummary(entry: StoredGraceEntry, nowMs: number): PersistentGraceSummary {
    return {
      orderId: entry.orderId,
      itemId: entry.itemId,
      type: entry.type,
      order: entry.order,
      item: entry.item,
      secondsLeft: Math.max(0, Math.ceil((entry.expiresAtMs - nowMs) / 1000)),
    };
  }

  private updateSnapshotAndNotify(): void {
    const nowMs = Date.now();
    const pendingUndoMap: Record<string, PendingUndoItem> = {};
    const activeEntries: PersistentGraceSummary[] = [];
    for (const entry of this.entries.values()) {
      const summary = this.toSummary(entry, nowMs);
      activeEntries.push(summary);
      pendingUndoMap[entry.orderId] = {
        orderId: entry.orderId,
        itemId: entry.itemId,
        type: entry.type,
        secondsLeft: summary.secondsLeft,
      };
    }
    this.snapshot = {
      pendingUndoMap,
      activeEntries,
      optimisticReadyItemIds: new Set(this.optimisticItemIds),
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const graceStoreRegistry = new WeakMap<QueryClient, KdsGracePeriodStore>();

/** Retrieve (or lazily instantiate) the persistent grace store bound to a QueryClient instance. */
export function getKdsGracePeriodStore(queryClient: QueryClient): KdsGracePeriodStore {
  let store = graceStoreRegistry.get(queryClient);
  if (!store) {
    store = new KdsGracePeriodStore();
    graceStoreRegistry.set(queryClient, store);
  }
  return store;
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
    const currentRef = pendingUndoRefs.current?.get(orderId);
    if (currentRef?.type === type) {
      clearInterval(intervalId);
      pendingUndoRefs.current?.delete(orderId);
      setPendingUndoMap((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await execute();
    }
  }, graceMs);

  pendingUndoRefs.current?.set(orderId, {
    timerId,
    intervalId,
    type,
    order,
    item,
    execute,
  });
}

