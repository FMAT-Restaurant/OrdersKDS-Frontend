import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useBumpBar } from '../../hooks/useBumpBar.ts';
import {
  ApiClient,
  apiClient as defaultApiClient,
  type ApiClient as ApiClientType,
} from '../../shared/api/client.ts';
import { queryClient as defaultQueryClient } from '../../shared/api/queryClient.ts';
import type { Order } from '../../shared/api/schemas.ts';
import type { TokenProvider, UserRole } from '../../shared/types/auth.ts';
import { OrderCard, type PendingUndoItem } from './OrderCard.tsx';
import { StationSelector } from './StationSelector.tsx';
import { type KdsViewType, useKdsQueue } from './useKdsQueue.ts';
import { pointerAction } from './pointerAction.ts';
import { getItemKey, getOrderKey, getOrderNumberDisplay } from './orderNumberDisplay.ts';
import { AdminVoidDialog } from './dialogs/AdminVoidDialog.tsx';
import { ChefVoidDialog } from './dialogs/ChefVoidDialog.tsx';
import { ConfirmReadyDialog } from './dialogs/ConfirmReadyDialog.tsx';
import { ConfirmRejectDialog } from './dialogs/ConfirmRejectDialog.tsx';

export interface KdsBoardProps {
  readonly client?: ApiClientType;
  readonly tokenProvider?: TokenProvider;
  readonly userRole?: UserRole;
  readonly queryClient?: QueryClient;
  readonly pageSize?: number;
  readonly initialView?: KdsViewType;
  readonly initialStation?: string;
  readonly onOrderSelect?: (order: Order) => void;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order, note: string) => void;
  readonly undoGracePeriodMs?: number;
}

function KdsBoardContent({
  client,
  tokenProvider,
  userRole,
  pageSize = 8,
  initialView = 'active',
  initialStation = 'general',
  onOrderSelect,
  onStartPreparation,
  onRejectSupplies,
  onAdminVoid,
  onChefVoid,
  undoGracePeriodMs = 15000,
}: Readonly<Omit<KdsBoardProps, 'queryClient'>>) {
  const [view, setView] = useState<KdsViewType>(initialView);
  const [selectedStation, setSelectedStation] = useState<string>(initialStation);
  const [page, setPage] = useState<number>(1);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'info';
  } | null>(null);
  const queryClient = useQueryClient();

  // Auto-dismiss action error after 15 seconds (User Requirement 3)
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => {
      setActionError(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Auto-dismiss action feedback after 5 seconds (User Requirement 5)
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  // Consume GET /kds/queue?view=active | delivered
  const { data, isLoading, isError, error } = useKdsQueue({
    view,
    client,
    tokenProvider,
  });

  const [voidDialogOrder, setVoidDialogOrder] = useState<Order | null>(null);
  const [voidDialogType, setVoidDialogType] = useState<'admin' | 'chef' | null>(null);

  const actionClient = useMemo(() => {
    if (client) return client;
    return tokenProvider ? new ApiClient({ tokenProvider }) : defaultApiClient;
  }, [client, tokenProvider]);

  const runAction = useCallback(
    async (
      key: string,
      path: string,
      body?: unknown,
      successMsg?: { text: string; type: 'success' | 'info' },
    ) => {
      if (!actionClient || pendingAction) return;
      setPendingAction(key);
      setActionError(null);
      try {
        if (body !== undefined) {
          await actionClient.patch(path, body);
        } else {
          await actionClient.patch(path);
        }
        await queryClient.invalidateQueries({ queryKey: ['kds'] });
        if (successMsg) {
          setFeedbackMessage(successMsg);
        }
      } catch (error_) {
        setActionError(
          error_ instanceof Error ? error_.message : 'No se pudo completar la acción.',
        );
      } finally {
        setPendingAction(null);
      }
    },
    [actionClient, pendingAction, queryClient],
  );

  const handleOpenAdminVoid = useCallback((order: Order) => {
    setVoidDialogOrder(order);
    setVoidDialogType('admin');
  }, []);

  const handleOpenChefVoid = useCallback((order: Order) => {
    setVoidDialogOrder(order);
    setVoidDialogType('chef');
  }, []);

  const handleAdminVoidConfirm = useCallback(
    async (order: Order) => {
      const orderId = getOrderKey(order);
      if (orderId) {
        if (onAdminVoid) {
          onAdminVoid(order);
        } else {
          await runAction('void-admin', `/orders/${orderId}/void`, undefined, {
            text: `Comanda #${order.orderNumber ?? orderId} anulada por administración.`,
            type: 'info',
          });
        }
        setVoidDialogOrder(null);
        setVoidDialogType(null);
      }
    },
    [onAdminVoid, runAction],
  );

  const handleChefVoidConfirm = useCallback(
    async (order: Order, note: string) => {
      const orderId = getOrderKey(order);
      if (orderId) {
        if (onChefVoid) {
          onChefVoid(order, note);
        } else {
          await runAction(
            'void-kitchen',
            `/orders/${orderId}/void-kitchen-error`,
            { note },
            {
              text: `Comanda #${order.orderNumber ?? orderId} anulada por error de cocina.`,
              type: 'info',
            },
          );
        }
        setVoidDialogOrder(null);
        setVoidDialogType(null);
      }
    },
    [onChefVoid, runAction],
  );

  const startPreparation = useCallback(
    (order: Order) => {
      const orderId = getOrderKey(order);
      if (orderId) {
        void runAction('start', `/orders/${orderId}/start-preparation`, undefined, {
          text: `Comanda #${order.orderNumber ?? orderId} en preparación.`,
          type: 'info',
        });
      }
    },
    [runAction],
  );

  const [confirmRejectTarget, setConfirmRejectTarget] = useState<Order | null>(null);

  const executeRejectSupplies = useCallback(
    (order: Order) => {
      const orderId = getOrderKey(order);
      const firstItem = order.items[0];
      const itemId = firstItem ? getItemKey(firstItem) : '';
      if (orderId && itemId) {
        void runAction(
          'reject',
          `/orders/${orderId}/items/${itemId}/kitchen-reject`,
          {
            reason: 'Insumo físico insuficiente en cocina',
          },
          {
            text: `Comanda #${order.orderNumber ?? orderId} rechazada por falta de insumos.`,
            type: 'info',
          },
        );
      }
    },
    [runAction],
  );

  const handleRejectClick = useCallback(
    (order: Order) => {
      if (onRejectSupplies) {
        onRejectSupplies(order);
      } else {
        setConfirmRejectTarget(order);
      }
    },
    [onRejectSupplies],
  );

  const handleConfirmRejectDialog = useCallback(() => {
    if (!confirmRejectTarget) return;
    const order = confirmRejectTarget;
    setConfirmRejectTarget(null);
    executeRejectSupplies(order);
  }, [confirmRejectTarget, executeRejectSupplies]);

  const [confirmReadyTarget, setConfirmReadyTarget] = useState<{
    order: Order;
    item: Order['items'][number];
  } | null>(null);

  // Pending undo grace period state (TASK-40b)
  const [pendingUndoMap, setPendingUndoMap] = useState<Record<string, PendingUndoItem>>({});
  const optimisticReadyItemIdsRef = useRef<Set<string>>(new Set());
  const [optimisticReadyItemIds, setOptimisticReadyItemIds] = useState<Set<string>>(
    () => new Set(),
  );

  const pendingUndoRefs = useRef<
    Map<
      string,
      {
        timerId: ReturnType<typeof setTimeout> | null;
        intervalId: ReturnType<typeof setInterval> | null;
        type: 'item' | 'order';
        order: Order;
        item?: Order['items'][number];
        execute: () => Promise<void>;
      }
    >
  >(new Map());

  const flushPendingItemUndos = useCallback(async () => {
    const itemEntries: {
      key: string;
      execute: () => Promise<void>;
    }[] = [];

    for (const [key, entry] of pendingUndoRefs.current.entries()) {
      if (entry.type === 'item') {
        if (entry.timerId) clearTimeout(entry.timerId);
        if (entry.intervalId) clearInterval(entry.intervalId);
        pendingUndoRefs.current.delete(key);
        itemEntries.push({ key, execute: entry.execute });
      }
    }

    if (itemEntries.length > 0) {
      setPendingUndoMap((prev) => {
        const next = { ...prev };
        for (const { key } of itemEntries) {
          delete next[key];
        }
        return next;
      });
      await Promise.all(itemEntries.map(({ execute }) => execute()));
    }
  }, []);

  const handleUndoReady = useCallback((targetOrder?: Order) => {
    const targetKey = targetOrder ? getOrderKey(targetOrder) : undefined;
    const orderKey = targetKey || Array.from(pendingUndoRefs.current.keys()).at(-1);
    if (!orderKey) return;

    const current = pendingUndoRefs.current.get(orderKey);
    if (!current) return;

    if (current.timerId) clearTimeout(current.timerId);
    if (current.intervalId) clearInterval(current.intervalId);

    pendingUndoRefs.current.delete(orderKey);
    setPendingUndoMap((prev) => {
      const next = { ...prev };
      delete next[orderKey];
      return next;
    });

    if (current.item) {
      const itemId = getItemKey(current.item);
      optimisticReadyItemIdsRef.current.delete(itemId);
      setOptimisticReadyItemIds(new Set(optimisticReadyItemIdsRef.current));
    }

    if (current.type === 'order') {
      const orderNumberDisplay = getOrderNumberDisplay(
        current.order.orderNumber,
        getOrderKey(current.order) || 'unknown',
      );
      const triggeringItemName = current.item?.name;
      setFeedbackMessage({
        text: triggeringItemName
          ? `Envío cancelado. ${triggeringItemName} se mantiene pendiente y la comanda #${orderNumberDisplay} sigue en preparación.`
          : `Envío cancelado. Comanda #${orderNumberDisplay} se mantiene en preparación.`,
        type: 'info',
      });
      return;
    }

    const itemName = current.item?.name ?? 'Platillo';
    setFeedbackMessage({
      text: `Envío cancelado. ${itemName} se mantiene pendiente.`,
      type: 'info',
    });
  }, []);

  const executeMarkItemReady = useCallback(
    async (order: Order, item: Order['items'][number]) => {
      const orderId = getOrderKey(order);
      const itemId = getItemKey(item);
      if (!orderId || !itemId) return;
      if (order.status === 'RESERVED' && actionClient) {
        await actionClient.patch(`/orders/${orderId}/start-preparation`);
      }
      await runAction(`item:${itemId}`, `/orders/${orderId}/items/${itemId}/ready`, undefined, {
        text: `${item.name} marcado como listo.`,
        type: 'success',
      });
    },
    [actionClient, runAction],
  );

  const startItemReadyGracePeriod = useCallback(
    (order: Order, item: Order['items'][number]) => {
      const orderId = getOrderKey(order);
      const itemId = getItemKey(item);
      if (!orderId || !itemId) return;

      // If this order is already counting down to be sent as ready, ignore item clicks
      if (pendingUndoRefs.current.get(orderId)?.type === 'order') {
        return;
      }

      // Flush any pending ITEM countdowns across the board
      void flushPendingItemUndos();

      const graceMs = undoGracePeriodMs ?? 15000;
      if (graceMs <= 0) {
        void executeMarkItemReady(order, item);
        return;
      }

      const totalSeconds = Math.max(1, Math.ceil(graceMs / 1000));
      optimisticReadyItemIdsRef.current.add(itemId);
      setOptimisticReadyItemIds(new Set(optimisticReadyItemIdsRef.current));

      setPendingUndoMap((prev) => ({
        ...prev,
        [orderId]: {
          orderId,
          itemId,
          type: 'item',
          secondsLeft: totalSeconds,
        },
      }));

      const execute = async () => {
        await executeMarkItemReady(order, item);
      };

      const intervalId = setInterval(() => {
        setPendingUndoMap((prev) => {
          const current = prev[orderId];
          if (current?.itemId !== itemId || current?.type !== 'item') return prev;
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
        if (currentRef?.type === 'item') {
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
        type: 'item',
        order,
        item,
        execute,
      });
    },
    [undoGracePeriodMs, flushPendingItemUndos, executeMarkItemReady],
  );

  const markItemReady = useCallback(
    (order: Order, item: Order['items'][number]) => {
      const orderId = getOrderKey(order);
      if (pendingUndoRefs.current.get(orderId)?.type === 'order') {
        return;
      }
      const targetItemId = getItemKey(item);
      const remainingPending = order.items.filter((i) => {
        const id = getItemKey(i);
        if (id === targetItemId) return false;
        if (optimisticReadyItemIdsRef.current.has(id)) return false;
        return i.status === 'PENDING';
      });
      // Flush any pending item countdowns across the board
      void flushPendingItemUndos();

      if (remainingPending.length === 0) {
        setConfirmReadyTarget({ order, item });
        return;
      }
      startItemReadyGracePeriod(order, item);
    },
    [flushPendingItemUndos, startItemReadyGracePeriod],
  );

  // Dispatch pending item/order ready on window unload/reload (TASK-40b)
  useEffect(() => {
    const activeRefs = pendingUndoRefs.current;
    const handleBeforeUnload = () => {
      for (const entry of activeRefs.values()) {
        if (entry.timerId) clearTimeout(entry.timerId);
        if (entry.intervalId) clearInterval(entry.intervalId);
        void entry.execute();
      }
      activeRefs.clear();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      for (const entry of activeRefs.values()) {
        if (entry.timerId) clearTimeout(entry.timerId);
        if (entry.intervalId) clearInterval(entry.intervalId);
      }
    };
  }, []);

  const executeMarkOrderReady = useCallback(
    async (order: Order) => {
      const orderId = getOrderKey(order);
      if (!orderId) return;
      if (order.status === 'RESERVED' && actionClient) {
        await actionClient.patch(`/orders/${orderId}/start-preparation`);
      }
      await runAction('order-ready', `/orders/${orderId}/ready`, undefined, {
        text: `Comanda #${order.orderNumber ?? orderId} marcada como lista.`,
        type: 'success',
      });
    },
    [actionClient, runAction],
  );

  const startOrderReadyGracePeriod = useCallback(
    (order: Order, triggeringItem?: Order['items'][number]) => {
      const orderId = getOrderKey(order);
      if (!orderId) return;

      // Clear any pending undo for this order (e.g. an individual item on this order)
      const existingEntry = pendingUndoRefs.current.get(orderId);
      if (existingEntry) {
        if (existingEntry.timerId) clearTimeout(existingEntry.timerId);
        if (existingEntry.intervalId) clearInterval(existingEntry.intervalId);
        pendingUndoRefs.current.delete(orderId);
        if (existingEntry.type === 'item') {
          void existingEntry.execute();
        }
      }

      if (triggeringItem) {
        const triggeringItemId = getItemKey(triggeringItem);
        optimisticReadyItemIdsRef.current.add(triggeringItemId);
        setOptimisticReadyItemIds(new Set(optimisticReadyItemIdsRef.current));
      }

      const graceMs = undoGracePeriodMs ?? 15000;
      if (graceMs <= 0) {
        if (triggeringItem) {
          void executeMarkItemReady(order, triggeringItem);
        } else {
          void executeMarkOrderReady(order);
        }
        return;
      }

      const totalSeconds = Math.max(1, Math.ceil(graceMs / 1000));
      const triggeringItemId = triggeringItem ? getItemKey(triggeringItem) : undefined;

      setPendingUndoMap((prev) => ({
        ...prev,
        [orderId]: {
          orderId,
          itemId: triggeringItemId,
          type: 'order',
          secondsLeft: totalSeconds,
        },
      }));

      const execute = async () => {
        if (triggeringItem) {
          await executeMarkItemReady(order, triggeringItem);
        } else {
          await executeMarkOrderReady(order);
        }
      };

      const intervalId = setInterval(() => {
        setPendingUndoMap((prev) => {
          const current = prev[orderId];
          if (current?.orderId !== orderId || current?.type !== 'order') return prev;
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
        if (currentRef?.type === 'order') {
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
        type: 'order',
        order,
        item: triggeringItem,
        execute,
      });
    },
    [undoGracePeriodMs, executeMarkOrderReady, executeMarkItemReady],
  );

  const handleConfirmReadyDialog = useCallback(() => {
    if (!confirmReadyTarget) return;
    const { order, item } = confirmReadyTarget;
    setConfirmReadyTarget(null);
    startOrderReadyGracePeriod(order, item);
  }, [confirmReadyTarget, startOrderReadyGracePeriod]);

  const handleKeepInPrepDialog = useCallback(() => {
    if (!confirmReadyTarget) return;
    const orderNumberDisplay =
      confirmReadyTarget.order.orderNumber ?? confirmReadyTarget.order.id;
    setConfirmReadyTarget(null);
    setFeedbackMessage({
      text: `Comanda #${orderNumberDisplay} se mantiene en preparación. Podrás marcarla como lista cuando finalices el emplatado.`,
      type: 'info',
    });
  }, [confirmReadyTarget]);

  // Dynamically derive available stations from current queue items, always including static "general"
  const availableStations = useMemo<string[]>(() => {
    const extracted = new Set<string>();
    extracted.add('general');
    if (data) {
      for (const order of data) {
        for (const item of order.items) {
          if (item.station) {
            const normalized = item.station.trim().toLowerCase();
            if (normalized) {
              extracted.add(normalized);
            }
          }
        }
      }
    }
    const allList = Array.from(extracted);
    const sortedStations = allList
      .filter((s) => s !== 'general')
      .sort((a, b) => a.localeCompare(b));
    return ['general', ...sortedStations];
  }, [data]);

  // Derive effective station: fallback to 'general' if selected station is not in queue
  const effectiveStation = availableStations.includes(selectedStation.toLowerCase())
    ? selectedStation
    : 'general';

  // Filter orders by station locally (OP-09, RF-08)
  const filteredOrders = useMemo<Order[]>(() => {
    if (!data) return [];
    if (effectiveStation.toLowerCase() === 'general') {
      return data;
    }
    return data.filter((order) =>
      order.items.some(
        (item) => item.station?.trim().toLowerCase() === effectiveStation.toLowerCase(),
      ),
    );
  }, [data, effectiveStation]);

  // Local pagination without scroll
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedOrders = useMemo<Order[]>(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const handleViewChange = useCallback((newView: KdsViewType) => {
    setView(newView);
    setPage(1);
  }, []);

  const handleStationChange = useCallback((station: string) => {
    setSelectedStation(station);
    setPage(1);
  }, []);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [totalPages],
  );

  // Bump bar keyboard actions (OP-06, TASK-40b)
  useBumpBar(
    useCallback(
      (action: string) => {
        switch (action) {
          case 'UNDO_LAST_READY': {
            handleUndoReady();
            break;
          }
          case 'PREVIOUS_STATION': {
            const currentIndex = availableStations.indexOf(effectiveStation.toLowerCase());
            if (currentIndex > 0) {
              setSelectedStation(availableStations[currentIndex - 1]);
              setPage(1);
            }
            break;
          }
          case 'NEXT_STATION': {
            const currentIndex = availableStations.indexOf(effectiveStation.toLowerCase());
            if (currentIndex >= 0 && currentIndex < availableStations.length - 1) {
              setSelectedStation(availableStations[currentIndex + 1]);
              setPage(1);
            }
            break;
          }
          case 'FOCUS_PREVIOUS_ORDER': {
            if (currentPage > 1) {
              setPage((prev) => Math.max(1, prev - 1));
            }
            break;
          }
          case 'FOCUS_NEXT_ORDER': {
            if (currentPage < totalPages) {
              setPage((prev) => Math.min(totalPages, prev + 1));
            }
            break;
          }
          default:
            break;
        }
      },
      [availableStations, effectiveStation, currentPage, totalPages, handleUndoReady],
    ),
  );

  // Render grid content without nested ternaries for SonarCloud compliance
  let gridContent: ReactNode;
  if (isLoading) {
    gridContent = (
      <output
        data-testid="kds-loading"
        aria-live="polite"
        className="flex items-center justify-center h-full text-2xl font-semibold text-gray-400"
      >
        Cargando comanda...
      </output>
    );
  } else if (isError) {
    gridContent = (
      <div
        data-testid="kds-error"
        role="alert"
        className="flex items-center justify-center h-full text-xl font-semibold text-error"
      >
        Error al cargar la comanda: {error?.message ?? 'Error inesperado'}
      </div>
    );
  } else if (paginatedOrders.length === 0) {
    gridContent = (
      <div
        data-testid="kds-empty"
        className="flex items-center justify-center h-full text-2xl font-semibold text-muted"
      >
        <span>No hay comandas pendientes</span>
        <span className="sr-only">No hay órdenes en esta vista</span>
      </div>
    );
  } else {
    gridContent = (
      <div
        data-testid="kds-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 min-h-0 auto-rows-max lg:auto-rows-fr lg:h-full content-start overflow-y-auto"
      >
        {paginatedOrders.map((order) => {
          const orderKey = getOrderKey(order);
          const pendingUndo = pendingUndoMap[orderKey];
          const isPendingUndoOrder = pendingUndo?.type === 'order';
          const activePendingUndoItem =
            pendingUndo?.type === 'item' ? pendingUndo : null;
          const undoOrderSecondsLeft = isPendingUndoOrder ? pendingUndo?.secondsLeft : undefined;
          const pendingOrderTriggeringItemId = isPendingUndoOrder ? pendingUndo?.itemId : undefined;

          return (
            <OrderCard
              key={orderKey}
              order={order}
              onClick={onOrderSelect}
              onStartPreparation={onStartPreparation ?? startPreparation}
              onRejectSupplies={handleRejectClick}
              onMarkOrderReady={startOrderReadyGracePeriod}
              onItemReady={markItemReady}
              onUndoReady={() => handleUndoReady(order)}
              pendingUndoItem={activePendingUndoItem}
              isPendingUndoOrder={isPendingUndoOrder}
              undoOrderSecondsLeft={undoOrderSecondsLeft}
              pendingOrderTriggeringItemId={pendingOrderTriggeringItemId}
              onUndoOrderReady={() => handleUndoReady(order)}
              optimisticReadyItemIds={optimisticReadyItemIds}
              onAdminVoid={handleOpenAdminVoid}
              onChefVoid={handleOpenChefVoid}
              userRole={userRole}
              pendingAction={pendingAction ?? undefined}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      data-testid="kds-board-container"
      className="orders-kds-root w-full h-full max-w-[1920px] max-h-[1080px] min-w-0 min-h-0 flex flex-col bg-canvas text-ink select-none overflow-hidden"
      style={{ overflow: 'hidden' }}
    >
      {/* Top Header: Tabs and Station Selector */}
      <header className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 bg-surface border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-sm">
        {/* View Tabs (Touch target >= 64px, with min-h-[48px] baseline) */}
        <div
          role="tablist"
          aria-label="Vistas KDS"
          className="flex items-center gap-1.5 sm:gap-2 bg-gray-100 p-1.5 rounded-lg border border-border shrink-0 overflow-x-auto max-w-full"
        >
          <button
            type="button"
            role="tab"
            id="tab-active"
            aria-controls="panel-kds-grid"
            aria-selected={view === 'active'}
            tabIndex={0}
            data-testid="tab-active-view"
            {...pointerAction(() => handleViewChange('active'))}
            style={{ minHeight: 64 }}
            className={`min-h-[48px] sm:min-h-[56px] md:min-h-[64px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-base sm:text-lg whitespace-nowrap transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer active:scale-[.98] ${
              view === 'active'
                ? 'bg-fmat-primary text-white shadow-md border border-fmat-primary'
                : 'bg-surface text-ink hover:text-ink hover:bg-gray-50 border border-border shadow hover:shadow-md'
            }`}
          >
            Comandas Activas
          </button>
          <button
            type="button"
            role="tab"
            id="tab-delivered"
            aria-controls="panel-kds-grid"
            aria-selected={view === 'delivered'}
            tabIndex={0}
            data-testid="tab-delivered"
            {...pointerAction(() => handleViewChange('delivered'))}
            style={{ minHeight: 64 }}
            className={`min-h-[48px] sm:min-h-[56px] md:min-h-[64px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-base sm:text-lg whitespace-nowrap transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer active:scale-[.98] ${
              view === 'delivered'
                ? 'bg-fmat-primary text-white shadow-md border border-fmat-primary'
                : 'bg-surface text-ink hover:text-ink hover:bg-gray-50 border border-border shadow hover:shadow-md'
            }`}
          >
            Entregadas
          </button>
        </div>

        {/* Segmented Station Selector */}
        <StationSelector
          stations={availableStations}
          selectedStation={effectiveStation}
          onSelectStation={handleStationChange}
        />
      </header>

      {/* Main Order Grid (Semantic section, no scroll permitted) */}
      <section
        id="panel-kds-grid"
        aria-label="Cuadrícula de comandas KDS"
        className="relative flex-1 min-h-0 p-4 sm:p-6 overflow-hidden flex flex-col justify-center bg-canvas"
      >
        {/* Floating Notification Toast Layer (Does not shift or shrink the grid) */}
        {(feedbackMessage || actionError) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl pointer-events-none flex flex-col gap-2">
            {feedbackMessage && (
              <output
                aria-live="polite"
                data-testid="kds-action-feedback"
                className={`pointer-events-auto rounded-control border px-4 py-2.5 text-sm sm:text-base font-semibold flex items-center justify-between shadow-lg backdrop-blur-sm transition-all ${
                  feedbackMessage.type === 'success'
                    ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950'
                    : 'bg-blue-50/95 border-blue-300 text-blue-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
                      feedbackMessage.type === 'success' ? 'bg-emerald-600' : 'bg-blue-600'
                    }`}
                  />
                  <span>{feedbackMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackMessage(null)}
                  aria-label="Cerrar notificación"
                  className="text-body hover:text-ink font-bold px-2 py-0.5 rounded hover:bg-black/10 cursor-pointer"
                >
                  ✕
                </button>
              </output>
            )}

            {actionError && (
              <div
                role="alert"
                data-testid="kds-action-error"
                className="pointer-events-auto rounded-control bg-red-50/95 border border-red-400 px-4 py-2.5 text-red-900 font-medium flex items-center justify-between shadow-lg backdrop-blur-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block shrink-0" />
                  <span>{actionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="Cerrar mensaje de error"
                  className="text-red-700 hover:text-red-900 font-bold px-2 py-0.5 rounded hover:bg-red-100/60 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
        {gridContent}
      </section>

      {/* Touch Pagination Footer */}
      <footer className="min-h-[4rem] sm:min-h-[5rem] px-4 sm:px-8 py-2.5 sm:py-3 bg-surface border-t border-border flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div data-testid="kds-page-info" className="text-base sm:text-xl font-bold font-mono text-ink">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            data-testid="pagination-prev"
            aria-label="Página anterior"
            disabled={currentPage <= 1}
            {...pointerAction(() => handlePageChange(currentPage - 1))}
            style={{ minHeight: 64 }}
            className="min-h-[48px] sm:min-h-[56px] md:min-h-[64px] min-w-[90px] sm:min-w-[120px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-sm sm:text-lg bg-surface text-fmat-primary border-2 border-fmat-primary disabled:opacity-40 disabled:border-border disabled:text-muted disabled:cursor-not-allowed hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150 shadow-sm cursor-pointer"
          >
            Anterior
          </button>
          <button
            type="button"
            data-testid="pagination-next"
            aria-label="Página siguiente"
            disabled={currentPage >= totalPages}
            {...pointerAction(() => handlePageChange(currentPage + 1))}
            style={{ minHeight: 64 }}
            className="min-h-[48px] sm:min-h-[56px] md:min-h-[64px] min-w-[90px] sm:min-w-[120px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-sm sm:text-lg bg-fmat-primary text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150 shadow-sm cursor-pointer"
          >
            Siguiente
          </button>
        </div>
      </footer>

      {confirmReadyTarget && (
        <ConfirmReadyDialog
          order={confirmReadyTarget.order}
          item={confirmReadyTarget.item}
          isOpen={true}
          isSubmitting={Boolean(pendingAction)}
          onConfirm={handleConfirmReadyDialog}
          onKeepInPrep={handleKeepInPrepDialog}
        />
      )}

      {confirmRejectTarget && (
        <ConfirmRejectDialog
          order={confirmRejectTarget}
          isOpen={true}
          isSubmitting={pendingAction === 'reject'}
          onConfirm={handleConfirmRejectDialog}
          onCancel={() => setConfirmRejectTarget(null)}
        />
      )}

      {voidDialogType === 'admin' && voidDialogOrder && (
        <AdminVoidDialog
          order={voidDialogOrder}
          isOpen={true}
          userRole={userRole}
          isSubmitting={pendingAction === 'void-admin'}
          onConfirm={handleAdminVoidConfirm}
          onCancel={() => {
            setVoidDialogOrder(null);
            setVoidDialogType(null);
          }}
        />
      )}

      {voidDialogType === 'chef' && voidDialogOrder && (
        <ChefVoidDialog
          order={voidDialogOrder}
          isOpen={true}
          userRole={userRole}
          isSubmitting={pendingAction === 'void-kitchen'}
          onConfirm={handleChefVoidConfirm}
          onCancel={() => {
            setVoidDialogOrder(null);
            setVoidDialogType(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Top-level KdsBoard component providing automatic TanStack QueryClient context.
 */
export function KdsBoard(props: Readonly<KdsBoardProps>) {
  const effectiveQueryClient = props.queryClient ?? defaultQueryClient;
  return (
    <QueryClientProvider client={effectiveQueryClient}>
      <KdsBoardContent {...props} />
    </QueryClientProvider>
  );
}
export default KdsBoard;
