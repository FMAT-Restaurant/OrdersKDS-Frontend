import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { OrderCard } from './OrderCard.tsx';
import { StationSelector } from './StationSelector.tsx';
import { type KdsViewType, useKdsQueue } from './useKdsQueue.ts';
import { pointerAction } from './pointerAction.ts';
import { AdminVoidDialog } from './dialogs/AdminVoidDialog.tsx';
import { ChefVoidDialog } from './dialogs/ChefVoidDialog.tsx';
import { ConfirmReadyDialog } from './dialogs/ConfirmReadyDialog.tsx';

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
      const orderId = order.orderId ?? order.publicId ?? order.id;
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
      const orderId = order.orderId ?? order.publicId ?? order.id;
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
      const orderId = order.orderId ?? order.publicId ?? order.id;
      if (orderId) {
        void runAction('start', `/orders/${orderId}/start-preparation`, undefined, {
          text: `Comanda #${order.orderNumber ?? orderId} en preparación.`,
          type: 'info',
        });
      }
    },
    [runAction],
  );

  const rejectSupplies = useCallback(
    (order: Order) => {
      const orderId = order.orderId ?? order.publicId ?? order.id;
      const firstItem = order.items[0];
      const itemId = firstItem?.itemId ?? firstItem?.publicId ?? firstItem?.id;
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

  const [confirmReadyTarget, setConfirmReadyTarget] = useState<{
    order: Order;
    item: Order['items'][number];
  } | null>(null);

  const executeMarkItemReady = useCallback(
    async (order: Order, item: Order['items'][number]) => {
      const orderId = order.orderId ?? order.publicId ?? order.id;
      const itemId = item.itemId ?? item.publicId ?? item.id;
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

  const markItemReady = useCallback(
    async (order: Order, item: Order['items'][number]) => {
      const targetItemId = item.itemId ?? item.publicId ?? item.id;
      const remainingPending = order.items.filter((i) => {
        const id = i.itemId ?? i.publicId ?? i.id;
        return id !== targetItemId && i.status === 'PENDING';
      });
      if (remainingPending.length === 0) {
        setConfirmReadyTarget({ order, item });
        return;
      }
      await executeMarkItemReady(order, item);
    },
    [executeMarkItemReady],
  );

  const handleConfirmReadyDialog = useCallback(async () => {
    if (!confirmReadyTarget) return;
    const { order, item } = confirmReadyTarget;
    setConfirmReadyTarget(null);
    await executeMarkItemReady(order, item);
  }, [confirmReadyTarget, executeMarkItemReady]);

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

  const markOrderReady = useCallback(
    async (order: Order) => {
      const orderId = order.orderId ?? order.publicId ?? order.id;
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

  // Bump bar keyboard actions (OP-06)
  useBumpBar(
    useCallback(
      (action: string) => {
        switch (action) {
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
      [availableStations, effectiveStation, currentPage, totalPages],
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
        No hay comandas en esta vista
        <span className="sr-only">No hay órdenes en esta vista</span>
      </div>
    );
  } else {
    gridContent = (
      <div
        data-testid="kds-grid"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 h-full min-h-0 auto-rows-fr content-start"
      >
        {paginatedOrders.map((order) => (
          <OrderCard
            key={order.id ?? order.orderId ?? order.publicId}
            order={order}
            onClick={onOrderSelect}
            onStartPreparation={onStartPreparation ?? startPreparation}
            onRejectSupplies={onRejectSupplies ?? rejectSupplies}
            onMarkOrderReady={markOrderReady}
            onItemReady={markItemReady}
            onAdminVoid={handleOpenAdminVoid}
            onChefVoid={handleOpenChefVoid}
            userRole={userRole}
            pendingAction={pendingAction ?? undefined}
          />
        ))}
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
            className={`min-h-[48px] sm:min-h-[56px] md:min-h-[64px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-md font-bold text-base sm:text-lg whitespace-nowrap transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              view === 'active'
                ? 'bg-fmat-primary text-white shadow-sm'
                : 'text-body hover:text-ink hover:bg-surface'
            }`}
          >
            Comandas en Activas
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
            className={`min-h-[48px] sm:min-h-[56px] md:min-h-[64px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-md font-bold text-base sm:text-lg whitespace-nowrap transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              view === 'delivered'
                ? 'bg-fmat-primary text-white shadow-sm'
                : 'text-body hover:text-ink hover:bg-surface'
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
        className="flex-1 min-h-0 p-6 overflow-hidden flex flex-col justify-center bg-canvas"
      >
        {feedbackMessage && (
          <div
            role="status"
            data-testid="kds-action-feedback"
            className={`mb-3 rounded-control border px-4 py-2.5 text-sm sm:text-base font-semibold flex items-center justify-between shadow-sm ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
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
              className="text-body hover:text-ink font-bold px-2 py-0.5 rounded hover:bg-black/5"
            >
              ✕
            </button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="kds-action-error"
            className="mb-3 rounded-control bg-red-50 border border-red-300 px-4 py-2.5 text-red-800 font-medium flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Cerrar mensaje de error"
              className="text-red-700 hover:text-red-900 font-bold px-2 py-0.5 rounded hover:bg-red-100/60"
            >
              ✕
            </button>
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
            className="min-h-[48px] sm:min-h-[56px] md:min-h-[64px] min-w-[90px] sm:min-w-[120px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-sm sm:text-lg bg-surface text-ink border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150 shadow-sm"
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
            className="min-h-[48px] sm:min-h-[56px] md:min-h-[64px] min-w-[90px] sm:min-w-[120px] px-4 sm:px-6 py-2 sm:py-2.5 rounded-control font-bold text-sm sm:text-lg bg-surface text-ink border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150 shadow-sm"
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
