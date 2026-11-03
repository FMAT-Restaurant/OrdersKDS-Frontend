import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBumpBar } from '../../hooks/useBumpBar.ts';
import {
  ApiClient,
  apiClient as defaultApiClient,
  type ApiClient as ApiClientType,
} from '../../shared/api/client.ts';
import { queryClient as defaultQueryClient } from '../../shared/api/queryClient.ts';
import type { Order } from '../../shared/api/schemas.ts';
import type { TokenProvider } from '../../shared/types/auth.ts';
import { OrderCard } from './OrderCard.tsx';
import { StationSelector } from './StationSelector.tsx';
import { type KdsViewType, useKdsQueue } from './useKdsQueue.ts';
import { pointerAction } from './pointerAction.ts';

export interface KdsBoardProps {
  readonly client?: ApiClientType;
  readonly tokenProvider?: TokenProvider;
  readonly queryClient?: QueryClient;
  readonly pageSize?: number;
  readonly initialView?: KdsViewType;
  readonly initialStation?: string;
  readonly onOrderSelect?: (order: Order) => void;
  readonly onStartPreparation?: (order: Order) => void;
  readonly onRejectSupplies?: (order: Order) => void;
}

function KdsBoardContent({
  client,
  tokenProvider,
  pageSize = 8,
  initialView = 'active',
  initialStation = 'general',
  onOrderSelect,
  onStartPreparation,
  onRejectSupplies,
}: Readonly<Omit<KdsBoardProps, 'queryClient'>>) {
  const [view, setView] = useState<KdsViewType>(initialView);
  const [selectedStation, setSelectedStation] = useState<string>(initialStation);
  const [page, setPage] = useState<number>(1);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Consume GET /kds/queue?view=active | delivered
  const { data, isLoading, isError, error } = useKdsQueue({
    view,
    client,
    tokenProvider,
  });

  const actionClient = useMemo(() => {
    if (client) return client;
    return tokenProvider ? new ApiClient({ tokenProvider }) : defaultApiClient;
  }, [client, tokenProvider]);

  const runAction = useCallback(
    async (key: string, path: string) => {
      if (!actionClient || pendingAction) return;
      setPendingAction(key);
      setActionError(null);
      try {
        await actionClient.patch(path);
        await defaultQueryClient.invalidateQueries({ queryKey: ['kds'] });
      } catch (error_) {
        setActionError(
          error_ instanceof Error ? error_.message : 'No se pudo completar la acción.',
        );
      } finally {
        setPendingAction(null);
      }
    },
    [actionClient, pendingAction],
  );

  const startPreparation = useCallback(
    (order: Order) => {
      const orderId = order.id ?? order.orderId ?? order.publicId;
      if (orderId) void runAction('start', `/orders/${orderId}/start-preparation`);
    },
    [runAction],
  );

  const markItemReady = useCallback(
    (order: Order, item: Order['items'][number]) => {
      const orderId = order.id ?? order.orderId ?? order.publicId;
      const itemId = item.id ?? item.itemId ?? item.publicId;
      if (orderId && itemId) void runAction(`item:${itemId}`, `/orders/${orderId}/items/${itemId}/ready`);
    },
    [runAction],
  );

  const markOrderReady = useCallback(
    (order: Order) => {
      const orderId = order.id ?? order.orderId ?? order.publicId;
      if (orderId) void runAction('order-ready', `/orders/${orderId}/ready`);
    },
    [runAction],
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
        Loading queue...
      </output>
    );
  } else if (isError) {
    gridContent = (
      <div
        data-testid="kds-error"
        role="alert"
        className="flex items-center justify-center h-full text-xl font-semibold text-error"
      >
        Failed to load queue: {error?.message ?? 'Unknown error'}
      </div>
    );
  } else if (paginatedOrders.length === 0) {
    gridContent = (
      <div
        data-testid="kds-empty"
        className="flex items-center justify-center h-full text-2xl font-semibold text-gray-500"
      >
        No orders in this view
      </div>
    );
  } else {
    gridContent = (
      <div
        data-testid="kds-grid"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 h-full auto-rows-fr content-start"
      >
        {paginatedOrders.map((order) => (
          <OrderCard
            key={order.id ?? order.orderId ?? order.publicId}
            order={order}
            onClick={onOrderSelect}
            onStartPreparation={onStartPreparation ?? startPreparation}
            onRejectSupplies={onRejectSupplies}
            onMarkOrderReady={markOrderReady}
            onItemReady={markItemReady}
            pendingAction={pendingAction ?? undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="kds-board-container"
      className="orders-kds-root w-full h-full max-w-[1920px] max-h-[1080px] min-w-[1024px] min-h-[600px] flex flex-col bg-gray-900 text-white select-none overflow-hidden"
      style={{ overflow: 'hidden' }}
    >
      {/* Top Header: Tabs and Station Selector */}
      <header className="px-8 py-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between gap-6 flex-wrap">
        {/* View Tabs (Touch target >= 64px, with min-h-[48px] baseline) */}
        <div
          role="tablist"
          aria-label="KDS Views"
          className="flex items-center gap-3 bg-gray-950/90 p-1.5 rounded-lg border border-gray-800"
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
            className={`min-h-[64px] min-h-[48px] px-6 py-2.5 rounded-md font-bold text-lg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              view === 'active'
                ? 'bg-fmat-primary text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Active View
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
            className={`min-h-[64px] min-h-[48px] px-6 py-2.5 rounded-md font-bold text-lg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              view === 'delivered'
                ? 'bg-fmat-primary text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Delivered
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
        aria-label="KDS Order Cards Grid"
        className="flex-1 p-6 overflow-hidden flex flex-col justify-center"
      >
        {actionError && (
          <div role="alert" className="mb-3 rounded-md bg-red-950 px-4 py-3 text-red-200">
            {actionError}
          </div>
        )}
        {gridContent}
      </section>

      {/* Touch Pagination Footer */}
      <footer className="h-20 px-8 py-3 bg-gray-950 border-t border-gray-800 flex items-center justify-between">
        <div data-testid="kds-page-info" className="text-xl font-bold font-mono text-gray-200">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            data-testid="pagination-prev"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            {...pointerAction(() => handlePageChange(currentPage - 1))}
            style={{ minHeight: 64 }}
            className="min-h-[64px] min-h-[48px] min-w-[120px] px-6 py-2.5 rounded-fmat font-bold text-lg bg-gray-800 text-white border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150"
          >
            Previous
          </button>
          <button
            type="button"
            data-testid="pagination-next"
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            {...pointerAction(() => handlePageChange(currentPage + 1))}
            style={{ minHeight: 64 }}
            className="min-h-[64px] min-h-[48px] min-w-[120px] px-6 py-2.5 rounded-fmat font-bold text-lg bg-gray-800 text-white border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-fmat-primary transition-colors duration-150"
          >
            Next
          </button>
        </div>
      </footer>
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
