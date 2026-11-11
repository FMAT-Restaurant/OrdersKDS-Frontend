import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { KdsBoard } from '../../src/features/kds-board/KdsBoard.tsx';
import { OrderCardStub } from '../../src/features/kds-board/OrderCardStub.tsx';
import { StationSelector } from '../../src/features/kds-board/StationSelector.tsx';
import { useKdsQueue } from '../../src/features/kds-board/useKdsQueue.ts';
import type { Order } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';
import type { ApiClient } from '../../src/shared/api/client.ts';
import {
  mockDeliveredOrder,
  mockDeliveredQueue,
  mockKdsQueue,
  mockOrder1,
} from '../mocks/fixtures/orderFixtures.ts';
import { server } from '../mocks/server.ts';

const validTokenProvider = async () => 'test-bearer-token';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function generateOrders(count: number): Order[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `ord-${200 + index}`;
    return {
      id,
      orderId: id,
      tableNumber: index + 1,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 100 + index * 10,
      items: [
        {
          id: `item-${index}`,
          itemId: `item-${index}`,
          dishId: `dish-${index}`,
          name: `Dish ${index + 1}`,
          quantity: 1,
          unitPrice: 50,
          status: ItemStatus.PENDING,
          station: index % 2 === 0 ? 'plancha' : 'freidora',
          version: 1,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };
  });
}

describe('KdsBoard Component Suite (TASK-15 Phase 1)', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });
  afterAll(() => server.close());

  // -------------------------------------------------------------------------
  // UT-FE-09: Base layout without scroll (1920x1080 landscape)
  // -------------------------------------------------------------------------
  describe('UT-FE-09: Base layout without scroll (1920x1080 landscape)', () => {
    it('configures container for 1920x1080 landscape and strictly forbids scroll', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('kds-board-container')).toBeInTheDocument();
      });

      const container = screen.getByTestId('kds-board-container');

      // Verifies CSS isolation class from TASK-08 / TASK-C08
      expect(container).toHaveClass('orders-kds-root');

      // Prohibits scroll: overflow must be hidden on container and style
      expect(container).toHaveClass('overflow-hidden');
      expect(container).toHaveStyle({ overflow: 'hidden' });

      // Landscape dimensions (1920x1080 bounding constraints)
      expect(container).toHaveClass('max-w-[1920px]');
      expect(container).toHaveClass('max-h-[1080px]');

      // Grid area does not allow scroll
      const mainGrid = screen.getByRole('region', { name: /Cuadrícula de comandas KDS|KDS Order Cards Grid/i });
      expect(mainGrid).toHaveClass('overflow-hidden');

      // Confirms cards render inside without triggering page scroll
      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });
    });

    it('renders OrderCardStub subcomponents with order ID and status to fill grid', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      expect(screen.getByTestId('order-id-ord-101')).toHaveTextContent('#ord-101');
      expect(screen.getByTestId('order-status-ord-101')).toHaveTextContent('IN_PREPARATION');

      expect(screen.getByTestId('order-card-stub-ord-102')).toBeInTheDocument();
      expect(screen.getByTestId('order-id-ord-102')).toHaveTextContent('#ord-102');
      expect(screen.getByTestId('order-status-ord-102')).toHaveTextContent('CREATED');
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-10: Active and Delivered tab switching
  // -------------------------------------------------------------------------
  describe('UT-FE-10: Active and Delivered tab switching', () => {
    it('renders touch tabs with >= 48px height and binds selection to query param view', async () => {
      let requestedView = '';
      server.use(
        http.get('*/kds/queue', ({ request }) => {
          const url = new URL(request.url);
          requestedView = url.searchParams.get('view') ?? '';
          if (requestedView === 'delivered') {
            return HttpResponse.json(mockDeliveredQueue);
          }
          return HttpResponse.json(mockKdsQueue);
        }),
      );

      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      const activeTab = screen.getByTestId('tab-active-view');
      const deliveredTab = screen.getByTestId('tab-delivered');

      // Verify touch target >= 48px constraint
      expect(activeTab).toHaveClass('min-h-[48px]');
      expect(deliveredTab).toHaveClass('min-h-[48px]');

      // Initial active state
      expect(activeTab).toHaveAttribute('aria-selected', 'true');
      expect(deliveredTab).toHaveAttribute('aria-selected', 'false');

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
        expect(requestedView).toBe('active');
      });

      // Switch to Delivered tab via tap/click
      fireEvent.click(deliveredTab);

      expect(activeTab).toHaveAttribute('aria-selected', 'false');
      expect(deliveredTab).toHaveAttribute('aria-selected', 'true');

      await waitFor(() => {
        expect(requestedView).toBe('delivered');
        expect(screen.getByTestId('order-card-stub-ord-103')).toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-101')).not.toBeInTheDocument();
      });

      // Switch back to Active View
      fireEvent.click(activeTab);

      expect(activeTab).toHaveAttribute('aria-selected', 'true');
      expect(deliveredTab).toHaveAttribute('aria-selected', 'false');

      await waitFor(() => {
        expect(requestedView).toBe('active');
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-103')).not.toBeInTheDocument();
      });
    });

    it('resets pagination page to 1 when switching view tabs', async () => {
      const tenOrders = generateOrders(10);
      server.use(
        http.get('*/kds/queue', ({ request }) => {
          const url = new URL(request.url);
          const view = url.searchParams.get('view');
          if (view === 'delivered') {
            return HttpResponse.json(mockDeliveredQueue);
          }
          return HttpResponse.json(tenOrders);
        }),
      );

      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          pageSize={4}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 3');
      });

      // Navigate to page 2
      fireEvent.click(screen.getByTestId('pagination-next'));
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 3');

      // Switch tab to Delivered
      fireEvent.click(screen.getByTestId('tab-delivered'));

      await waitFor(() => {
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 1');
      });
    });

    it('renders and switches between all 4 KDS tabs (Pendientes, En Preparación, Rehechuras, Entregadas) with priority contrast', async () => {
      const mixedOrders: Order[] = [
        {
          ...mockOrder1,
          id: 'ord-pending-1',
          orderId: 'ord-pending-1',
          status: OrderStatus.RESERVED,
        },
        {
          ...mockOrder1,
          id: 'ord-in-prep-1',
          orderId: 'ord-in-prep-1',
          status: OrderStatus.IN_PREPARATION,
        },
        {
          ...mockDeliveredOrder,
          id: 'ord-redo-1',
          orderId: 'ord-redo-1',
          status: OrderStatus.DELIVERED,
          items: [
            {
              ...mockDeliveredOrder.items[0],
              id: 'redo-item-1',
              itemId: 'redo-item-1',
              status: ItemStatus.PENDING,
            },
          ],
        },
      ];

      server.use(
        http.get('*/kds/queue', ({ request }) => {
          const url = new URL(request.url);
          const viewParam = url.searchParams.get('view');
          if (viewParam === 'delivered') {
            return HttpResponse.json([mockDeliveredOrder]);
          }
          return HttpResponse.json(mixedOrders);
        }),
      );

      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      const pendingTab = screen.getByTestId('tab-pending');
      const inPrepTab = screen.getByTestId('tab-active-view');
      const redoTab = screen.getByTestId('tab-redo-view');
      const deliveredTab = screen.getByTestId('tab-delivered');

      // Verify touch targets >= 48px on all tabs
      expect(pendingTab).toHaveClass('min-h-[48px]');
      expect(inPrepTab).toHaveClass('min-h-[48px]');
      expect(redoTab).toHaveClass('min-h-[48px]');
      expect(deliveredTab).toHaveClass('min-h-[48px]');

      // High-contrast alert on redo tab when redoCount > 0
      await waitFor(() => {
        expect(screen.getByTestId('redo-badge')).toHaveTextContent('1');
        expect(redoTab).toHaveClass('bg-red-600');
        expect(redoTab).toHaveClass('animate-pulse');
      });

      // Switch to Pendientes
      fireEvent.click(pendingTab);
      expect(pendingTab).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-pending-1')).toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-in-prep-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-redo-1')).not.toBeInTheDocument();
      });

      // Switch to En Preparación
      fireEvent.click(inPrepTab);
      expect(inPrepTab).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-in-prep-1')).toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-pending-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-redo-1')).not.toBeInTheDocument();
      });

      // Switch to Rehechuras (devueltas)
      fireEvent.click(redoTab);
      expect(redoTab).toHaveAttribute('aria-selected', 'true');
      expect(redoTab).toHaveClass('bg-red-700');
      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-redo-1')).toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-in-prep-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('order-card-stub-ord-pending-1')).not.toBeInTheDocument();
      });

      // Switch to Entregadas
      fireEvent.click(deliveredTab);
      expect(deliveredTab).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-103')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-11: Touch pagination with large buttons
  // -------------------------------------------------------------------------
  describe('UT-FE-11: Touch pagination with large buttons', () => {
    it('paginates cards with big touch buttons (>= 48px) and updates visible page', async () => {
      const tenOrders = generateOrders(10);
      server.use(
        http.get('*/kds/queue', () => HttpResponse.json(tenOrders)),
      );

      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          pageSize={4}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 3');
      });

      const prevBtn = screen.getByTestId('pagination-prev');
      const nextBtn = screen.getByTestId('pagination-next');

      // Verify touch target >= 48px
      expect(prevBtn).toHaveClass('min-h-[48px]');
      expect(nextBtn).toHaveClass('min-h-[48px]');

      // On page 1: Previous is disabled, Next is enabled
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      // Page 1 cards: ord-200 to ord-203
      expect(screen.getByTestId('order-card-stub-ord-200')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-203')).toBeInTheDocument();
      expect(screen.queryByTestId('order-card-stub-ord-204')).not.toBeInTheDocument();

      // Tap Next -> page 2
      fireEvent.click(nextBtn);
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 3');
      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeEnabled();

      // Page 2 cards: ord-204 to ord-207
      expect(screen.queryByTestId('order-card-stub-ord-200')).not.toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-204')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-207')).toBeInTheDocument();

      // Tap Next -> page 3 (last page)
      fireEvent.click(nextBtn);
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 3 de 3');
      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeDisabled();

      // Page 3 cards: ord-208 and ord-209
      expect(screen.getByTestId('order-card-stub-ord-208')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-209')).toBeInTheDocument();

      // Tap Previous -> back to page 2
      fireEvent.click(prevBtn);
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 3');
      expect(screen.getByTestId('order-card-stub-ord-204')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-12: Dynamic station selector extraction
  // -------------------------------------------------------------------------
  describe('UT-FE-12: Dynamic station selector extraction', () => {
    it('dynamically derives stations from queue items and always includes static "general"', async () => {
      // mockOrder1 has 'plancha' & 'freidora', mockOrder2 has 'frio'
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('station-tab-plancha')).toBeInTheDocument();
      });

      // Stations extracted dynamically: general, freidora, frio, plancha
      expect(screen.getByTestId('station-tab-general')).toBeInTheDocument();
      expect(screen.getByTestId('station-tab-plancha')).toBeInTheDocument();
      expect(screen.getByTestId('station-tab-freidora')).toBeInTheDocument();
      expect(screen.getByTestId('station-tab-frio')).toBeInTheDocument();
    });

    it('always includes static "general" even when queue has no stations or is empty', async () => {
      server.use(
        http.get('*/kds/queue', () => HttpResponse.json([])),
      );

      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('kds-empty')).toHaveTextContent('No hay órdenes en esta vista');
      });

      expect(screen.getByTestId('station-tab-general')).toBeInTheDocument();
      expect(screen.queryByTestId('station-tab-plancha')).not.toBeInTheDocument();
    });

    it('filters orders locally when a station is selected, and shows all on "general"', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
        expect(screen.getByTestId('order-card-stub-ord-102')).toBeInTheDocument();
      });

      // General shows all
      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'true');

      // Select station 'frio' (only ord-102 has 'frio')
      fireEvent.click(screen.getByTestId('station-tab-frio'));

      expect(screen.getByTestId('station-tab-frio')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'false');

      expect(screen.getByTestId('order-card-stub-ord-102')).toBeInTheDocument();
      expect(screen.queryByTestId('order-card-stub-ord-101')).not.toBeInTheDocument();

      // Select station 'plancha' (only ord-101 has 'plancha')
      fireEvent.click(screen.getByTestId('station-tab-plancha'));

      expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      expect(screen.queryByTestId('order-card-stub-ord-102')).not.toBeInTheDocument();

      // Return to 'general' (all orders visible)
      fireEvent.click(screen.getByTestId('station-tab-general'));

      expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-102')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // ST-01 to ST-05 & ST-15: System and Accessibility Parity
  // -------------------------------------------------------------------------
  describe('ST-01 to ST-05 and ST-15: Touch & Keyboard Parity and Accessibility', () => {
    it('ST-01: displays queue in 1920x1080 landscape with legible cards and table numbers', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      const board = screen.getByTestId('kds-board-container');
      expect(board).toHaveClass('orders-kds-root');
      expect(board).toHaveClass('overflow-hidden');

      // Card stub displays table number when present
      expect(screen.getByTestId('order-table-ord-101')).toHaveTextContent('Table 4');
    });

    it('ST-02: interactive elements are operable by tap and keyboard (Enter/Space)', async () => {
      const onSelectOrder = vi.fn();
      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          onOrderSelect={onSelectOrder}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      const card = screen.getByTestId('order-card-stub-ord-101');

      // Tap / Click
      fireEvent.click(card);
      expect(onSelectOrder).toHaveBeenCalledWith(mockOrder1);

      // Keyboard Enter on card
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onSelectOrder).toHaveBeenCalledTimes(2);

      // Keyboard Space on card
      fireEvent.keyDown(card, { key: ' ' });
      expect(onSelectOrder).toHaveBeenCalledTimes(3);
    });

    it('ST-03: all interactive controls adhere to large touch target criteria (>= 48px)', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('station-tab-plancha')).toBeInTheDocument();
      });

      // View tabs
      expect(screen.getByTestId('tab-active-view')).toHaveClass('min-h-[48px]');
      expect(screen.getByTestId('tab-delivered')).toHaveClass('min-h-[48px]');

      // Station selector buttons
      expect(screen.getByTestId('station-tab-general')).toHaveClass('min-h-[48px]');
      expect(screen.getByTestId('station-tab-plancha')).toHaveClass('min-h-[48px]');

      // Pagination buttons
      expect(screen.getByTestId('pagination-prev')).toHaveClass('min-h-[48px]');
      expect(screen.getByTestId('pagination-next')).toHaveClass('min-h-[48px]');
    });

    it('ST-04: supports bump bar navigation across orders and pages via ArrowLeft and ArrowRight', async () => {
      const tenOrders = generateOrders(10);
      server.use(
        http.get('*/kds/queue', () => HttpResponse.json(tenOrders)),
      );

      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          pageSize={4}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 3');
      });

      // ArrowRight maps to FOCUS_NEXT_ORDER in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 3');

      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 3 de 3');

      // ArrowLeft maps to FOCUS_PREVIOUS_ORDER in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'ArrowLeft' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 3');
    });

    it('ST-05: station selector operable via bump bar PageDown and PageUp keys', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('station-tab-plancha')).toBeInTheDocument();
      });

      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'true');

      // PageDown maps to NEXT_STATION in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'PageDown' });
      // Stations: general, freidora, frio, plancha
      expect(screen.getByTestId('station-tab-freidora')).toHaveAttribute('aria-checked', 'true');

      fireEvent.keyDown(window, { code: 'PageDown' });
      expect(screen.getByTestId('station-tab-frio')).toHaveAttribute('aria-checked', 'true');

      // PageUp maps to PREVIOUS_STATION in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'PageUp' });
      expect(screen.getByTestId('station-tab-freidora')).toHaveAttribute('aria-checked', 'true');
    });

    it('ST-15: verifies landscape layout dimensions and absence of scroll overflow', async () => {
      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('kds-board-container')).toBeInTheDocument();
      });

      const container = screen.getByTestId('kds-board-container');
      expect(container.style.overflow).toBe('hidden');
      expect(container).toHaveClass('overflow-hidden');
      expect(container).toHaveClass('max-w-[1920px]');
      expect(container).toHaveClass('max-h-[1080px]');
    });
  });

  // -------------------------------------------------------------------------
  // Comprehensive Branch Coverage Suite
  // -------------------------------------------------------------------------
  describe('Error and Boundary Branch Coverage', () => {
    it('renders error alert when queue fetch fails', async () => {
      server.use(
        http.get('*/kds/queue', () =>
          HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Database connection failed' } },
            { status: 500 },
          ),
        ),
      );

      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('kds-error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('kds-error')).toHaveTextContent('Error al cargar la comanda:');
    });

    it('handles bump bar boundary conditions without exceeding bounds', async () => {
      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          pageSize={1}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('station-tab-plancha')).toBeInTheDocument();
      });

      // At station general (index 0), PageUp must remain at general
      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'true');
      fireEvent.keyDown(window, { code: 'PageUp' });
      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'true');

      // Navigate to last station (freidora -> frio -> plancha)
      fireEvent.keyDown(window, { code: 'PageDown' });
      fireEvent.keyDown(window, { code: 'PageDown' });
      fireEvent.keyDown(window, { code: 'PageDown' });
      expect(screen.getByTestId('station-tab-plancha')).toHaveAttribute('aria-checked', 'true');

      // At last station, PageDown must remain at plancha
      fireEvent.keyDown(window, { code: 'PageDown' });
      expect(screen.getByTestId('station-tab-plancha')).toHaveAttribute('aria-checked', 'true');

      // At page 1 with ArrowLeft, must remain at page 1
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 1');
      fireEvent.keyDown(window, { code: 'ArrowLeft' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 1');

      // Switch back to general (2 orders, pageSize 1 -> 2 pages)
      fireEvent.click(screen.getByTestId('station-tab-general'));
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 1 de 2');

      // Advance to page 2 (last page)
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 2');

      // At last page, ArrowRight must remain at page 2
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 2');

      // Unrecognized action hits default branch safely
      fireEvent.keyDown(window, { code: 'Backspace' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Página 2 de 2');
    });

    it('falls back to "general" station if initialStation does not exist in queue', async () => {
      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          tokenProvider={validTokenProvider}
          queryClient={queryClient}
          initialStation="station-inexistente"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('station-tab-general')).toBeInTheDocument();
      });

      expect(screen.getByTestId('station-tab-general')).toHaveAttribute('aria-checked', 'true');
    });

    it('handles orders with empty or whitespace stations gracefully', async () => {
      const ordersWithEmptyStation: Order[] = [
        {
          id: 'ord-empty',
          orderId: 'ord-empty',
          tableNumber: null,
          isTakeaway: true,
          status: OrderStatus.CREATED,
          version: 1,
          totalAmount: 50,
          items: [
            {
              id: 'it-empty',
              dishId: 'dish-soda',
              name: 'Soda',
              quantity: 1,
              unitPrice: 50,
              status: ItemStatus.PENDING,
              station: '   ',
              version: 1,
            },
          ],
          createdAt: '2026-10-19T20:00:00Z',
        },
      ];

      server.use(
        http.get('*/kds/queue', () => HttpResponse.json(ordersWithEmptyStation)),
      );

      const queryClient = createTestQueryClient();
      render(<KdsBoard tokenProvider={validTokenProvider} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-empty')).toBeInTheDocument();
      });

      // Only 'general' station should be present
      expect(screen.getByTestId('station-tab-general')).toBeInTheDocument();
      expect(screen.queryByTestId('station-tab-plancha')).not.toBeInTheDocument();
    });

    it('supports direct ApiClient injection via props', async () => {
      const mockCustomClient = {
        get: vi.fn().mockResolvedValue([mockOrder1]),
      } as unknown as import('../../src/shared/api/client.ts').ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockCustomClient} queryClient={queryClient} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      expect(mockCustomClient.get).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Isolated component tests for stubs
  // -------------------------------------------------------------------------
  describe('OrderCardStub isolated behavior', () => {
    it('renders with fallback when order id is missing', () => {
      const incompleteOrder = {
        ...mockOrder1,
        id: undefined,
        orderId: undefined,
        publicId: undefined,
      } as unknown as Order;

      render(<OrderCardStub order={incompleteOrder} />);
      expect(screen.getByTestId('order-id-unknown')).toHaveTextContent('#unknown');
    });

    it('resolves displayId from orderId or publicId when id is missing', () => {
      const orderWithOrderId = {
        ...mockOrder1,
        id: undefined,
        orderId: 'by-order-id',
        publicId: undefined,
      } as unknown as Order;

      const { rerender } = render(<OrderCardStub order={orderWithOrderId} />);
      expect(screen.getByTestId('order-id-by-order-id')).toHaveTextContent('#by-order-id');

      const orderWithPublicId = {
        ...mockOrder1,
        id: undefined,
        orderId: undefined,
        publicId: 'by-public-id',
      } as unknown as Order;

      rerender(<OrderCardStub order={orderWithPublicId} />);
      expect(screen.getByTestId('order-id-by-public-id')).toHaveTextContent('#by-public-id');
    });

    it('handles tableNumber null and undefined correctly', () => {
      const orderNoTable = {
        ...mockOrder1,
        tableNumber: undefined,
      };

      render(<OrderCardStub order={orderNoTable} />);
      expect(screen.queryByTestId('order-table-ord-101')).not.toBeInTheDocument();
    });

    it('ignores non-activation keyboard events on OrderCardStub', () => {
      const onClick = vi.fn();
      render(<OrderCardStub order={mockOrder1} onClick={onClick} />);

      const card = screen.getByTestId('order-card-stub-ord-101');
      fireEvent.keyDown(card, { key: 'Escape' });
      fireEvent.keyDown(card, { key: 'Tab' });

      expect(onClick).not.toHaveBeenCalled();
    });

    it('applies focused ring styling when isFocused is true', () => {
      const { rerender } = render(<OrderCardStub order={mockOrder1} isFocused={false} />);
      const card = screen.getByTestId('order-card-stub-ord-101');
      expect(card).not.toHaveClass('ring-2 ring-fmat-primary');

      rerender(<OrderCardStub order={mockOrder1} isFocused={true} />);
      expect(card).toHaveClass('ring-2 ring-fmat-primary');
    });

    it('does not throw when onClick is omitted on click and enter', () => {
      render(<OrderCardStub order={mockOrder1} />);
      const card = screen.getByTestId('order-card-stub-ord-101');
      expect(() => {
        fireEvent.click(card);
        fireEvent.keyDown(card, { key: 'Enter' });
      }).not.toThrow();
    });
  });

  describe('StationSelector isolated behavior', () => {
    it('handles keyboard Enter and Space activation on station buttons', () => {
      const onSelect = vi.fn();
      render(
        <StationSelector
          stations={['general', 'plancha']}
          selectedStation="general"
          onSelectStation={onSelect}
        />,
      );

      const planchaBtn = screen.getByTestId('station-tab-plancha');

      fireEvent.keyDown(planchaBtn, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('plancha');

      fireEvent.keyDown(planchaBtn, { key: ' ' });
      expect(onSelect).toHaveBeenCalledWith('plancha');
    });

    it('ignores non-activation keys on station buttons', () => {
      const onSelect = vi.fn();
      render(
        <StationSelector
          stations={['general', 'plancha']}
          selectedStation="general"
          onSelectStation={onSelect}
        />,
      );

      const planchaBtn = screen.getByTestId('station-tab-plancha');
      fireEvent.keyDown(planchaBtn, { key: 'Escape' });
      fireEvent.keyDown(planchaBtn, { key: 'ArrowDown' });

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('useKdsQueue isolated behavior', () => {
    it('falls back to defaultApiClient when client and tokenProvider are omitted', () => {
      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useKdsQueue({ enabled: false }), { wrapper });
      expect(result.current.isPending).toBe(true);
    });

    it('creates client with tokenProvider when only tokenProvider is passed', () => {
      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => useKdsQueue({ tokenProvider: validTokenProvider, enabled: false }),
        { wrapper },
      );
      expect(result.current.isPending).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TASK-40a: KdsBoard Touch Actions & runAction Execution
  // -------------------------------------------------------------------------
  describe('TASK-40a: KdsBoard Touch Actions & runAction Execution', () => {
    it('executes startPreparation, markOrderReady, and markItemReady through action client', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      // 1. Mark order ready
      const readyBtn = screen.getByTestId('order-action-ready-ord-101');
      fireEvent.click(readyBtn);

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-101/ready');
      });

      // 2. Mark item ready (opens confirmation dialog for the last pending dish)
      const item1Btn = screen.getByTestId('order-item-action-item-1');
      fireEvent.click(item1Btn);
      const confirmBtn = await screen.findByTestId('confirm-ready-submit-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-101/items/item-1/ready');
      });
    });

    it('highlights a pending redo item while keeping its order in the delivered view', async () => {
      const redoneDeliveredOrder: Order = {
        ...mockDeliveredOrder,
        items: mockDeliveredOrder.items.map((item) => ({
          ...item,
          status: ItemStatus.PENDING,
        })),
      };
      const mockClient = {
        get: vi.fn().mockResolvedValue([redoneDeliveredOrder]),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
          initialView="delivered"
        />,
      );

      expect(await screen.findByTestId('redo-pending-item-4')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-ord-103')).toBeInTheDocument();
      expect(screen.getByTestId('order-status-ord-103')).toHaveTextContent('DELIVERED');
      expect(screen.getByTestId('order-item-item-4')).toHaveAttribute('data-redo-pending', 'true');
      expect(screen.queryByTestId('order-action-ready-ord-103')).not.toBeInTheDocument();
    });

    it('triggers onStartPreparation and onRejectSupplies props when provided', async () => {
      const onStart = vi.fn();
      const onReject = vi.fn();
      const queryClient = createTestQueryClient();

      const mockClient = {
        get: vi.fn().mockResolvedValue([
          {
            ...mockOrder1,
            id: 'ord-reserved',
            orderId: 'ord-reserved',
            status: OrderStatus.RESERVED,
          },
        ]),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={queryClient}
          onStartPreparation={onStart}
          onRejectSupplies={onReject}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-action-start-ord-reserved')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-start-ord-reserved'));
      expect(onStart).toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('order-action-reject-ord-reserved'));
      expect(onReject).toHaveBeenCalled();
    });

    it('triggers default startPreparation when onStartPreparation prop is not provided', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue([
          {
            ...mockOrder1,
            id: 'ord-res-default',
            orderId: 'ord-res-default',
            status: OrderStatus.RESERVED,
          },
        ]),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-start-ord-res-default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-start-ord-res-default'));

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-res-default/start-preparation');
      });
    });

    it('displays error alert when runAction fails with Error instance', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockRejectedValue(new Error('Network error at kitchen terminal')),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-ready-ord-101')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-ready-ord-101'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Network error at kitchen terminal');
      });
    });

    it('displays fallback error alert when runAction fails with non-Error', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockRejectedValue('Fatal unknown string failure'),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-ready-ord-101')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-ready-ord-101'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('No se pudo completar la acción.');
      });

      const dismissErrBtn = screen.getByRole('button', { name: 'Cerrar mensaje de error' });
      fireEvent.click(dismissErrBtn);
      expect(screen.queryByTestId('kds-action-error')).not.toBeInTheDocument();
    });

    it('displays action feedback toast on success and supports manual dismissal (User Requirement 5)', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-ready-ord-101')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-ready-ord-101'));

      await waitFor(() => {
        expect(screen.getByTestId('kds-action-feedback')).toBeInTheDocument();
      });

      const dismissBtn = screen.getByRole('button', { name: 'Cerrar notificación' });
      fireEvent.click(dismissBtn);
      expect(screen.queryByTestId('kds-action-feedback')).not.toBeInTheDocument();
    });

    it('opens and confirms AdminVoidDialog from KdsBoard and dispatches void request', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-admin-void-ord-101')).toBeInTheDocument();
      });

      // Open Admin void dialog
      fireEvent.click(screen.getByTestId('order-action-admin-void-ord-101'));
      expect(screen.getByTestId('admin-void-dialog')).toBeInTheDocument();

      // Confirm void
      fireEvent.click(screen.getByTestId('admin-void-confirm'));

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-101/void');
      });
      expect(screen.queryByTestId('admin-void-dialog')).not.toBeInTheDocument();
    });

    it('opens and confirms ChefVoidDialog from KdsBoard and dispatches kitchen void request with note', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-chef-void-ord-101')).toBeInTheDocument();
      });

      // Open Chef void dialog
      fireEvent.click(screen.getByTestId('order-action-chef-void-ord-101'));
      expect(screen.getByTestId('chef-void-dialog')).toBeInTheDocument();

      // Cancel dismisses the dialog
      fireEvent.click(screen.getByTestId('chef-void-cancel'));
      expect(screen.queryByTestId('chef-void-dialog')).not.toBeInTheDocument();

      // Re-open and confirm with note
      fireEvent.click(screen.getByTestId('order-action-chef-void-ord-101'));
      fireEvent.click(screen.getByRole('button', { name: 'Quemado' }));
      fireEvent.click(screen.getByTestId('chef-void-confirm'));

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-101/void-kitchen-error', {
          note: 'Quemado',
        });
      });
      expect(screen.queryByTestId('chef-void-dialog')).not.toBeInTheDocument();
    });

    it('delegates to custom onAdminVoid and onChefVoid props when provided on KdsBoard', async () => {
      const onAdminVoid = vi.fn();
      const onChefVoid = vi.fn();

      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({ success: true }),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(
        <KdsBoard
          client={mockClient}
          queryClient={queryClient}
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-action-admin-void-ord-101')).toBeInTheDocument();
      });

      // Test custom onAdminVoid delegation
      fireEvent.click(screen.getByTestId('order-action-admin-void-ord-101'));
      fireEvent.click(screen.getByTestId('admin-void-confirm'));
      expect(onAdminVoid).toHaveBeenCalledWith(expect.objectContaining({ id: 'ord-101' }));

      // Test custom onChefVoid delegation
      fireEvent.click(screen.getByTestId('order-action-chef-void-ord-101'));
      fireEvent.click(screen.getByRole('button', { name: 'Quemado' }));
      fireEvent.click(screen.getByTestId('chef-void-confirm'));
      expect(onChefVoid).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ord-101' }),
        'Quemado',
      );
    });

    it('marks order and item ready on an IN_PREPARATION order', async () => {
      const inPrepOrder: Order = {
        ...mockOrder1,
        id: 'ord-inprep-1',
        orderId: 'ord-inprep-1',
        status: OrderStatus.IN_PREPARATION,
        items: [
          {
            ...mockOrder1.items[0],
            id: 'item-res-1',
            itemId: 'item-res-1',
            status: ItemStatus.PENDING,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([inPrepOrder]),
        patch: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-ready-ord-inprep-1')).toBeInTheDocument();
      });

      // Mark order ready: patches ready
      fireEvent.click(screen.getByTestId('order-action-ready-ord-inprep-1'));
      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-inprep-1/ready');
      });

      // Mark item ready: opens confirm dialog and patches item ready
      fireEvent.click(screen.getByTestId('order-item-action-item-res-1'));
      const confirmItemBtn = await screen.findByTestId('confirm-ready-submit-btn');
      fireEvent.click(confirmItemBtn);
      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-inprep-1/items/item-res-1/ready');
      });
    });

    it('does not display "Comanda lista" on RESERVED orders (anti-pattern prevention)', async () => {
      const reservedOrder: Order = {
        ...mockOrder1,
        id: 'ord-res-noprep',
        orderId: 'ord-res-noprep',
        status: OrderStatus.RESERVED,
      };
      const mockClient = {
        get: vi.fn().mockResolvedValue([reservedOrder]),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-start-ord-res-noprep')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('order-action-ready-ord-res-noprep')).not.toBeInTheDocument();
    });

    it('dispatches kitchen-reject when onRejectSupplies prop is omitted on RESERVED order', async () => {
      const reservedOrder: Order = {
        ...mockOrder1,
        id: 'ord-res-reject',
        orderId: 'ord-res-reject',
        status: OrderStatus.RESERVED,
        items: [
          {
            ...mockOrder1.items[0],
            id: 'item-res-reject',
            itemId: 'item-res-reject',
            status: ItemStatus.PENDING,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([reservedOrder]),
        patch: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-reject-ord-res-reject')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-reject-ord-res-reject'));
      const confirmRejectBtn = await screen.findByTestId('confirm-reject-submit-btn');
      fireEvent.click(confirmRejectBtn);

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith(
          '/orders/ord-res-reject/items/item-res-reject/kitchen-reject',
          { reason: 'Insumo físico insuficiente en cocina' },
        );
      });
    });

    it('allows cancelling ConfirmRejectDialog without dispatching kitchen-reject', async () => {
      const reservedOrder: Order = {
        ...mockOrder1,
        id: 'ord-res-cancel-reject',
        orderId: 'ord-res-cancel-reject',
        status: OrderStatus.RESERVED,
        items: [
          {
            ...mockOrder1.items[0],
            id: 'item-res-cancel-reject',
            itemId: 'item-res-cancel-reject',
            status: ItemStatus.PENDING,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([reservedOrder]),
        patch: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-reject-ord-res-cancel-reject')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('order-action-reject-ord-res-cancel-reject'));
      const cancelRejectBtn = await screen.findByTestId('confirm-reject-cancel-btn');
      fireEvent.click(cancelRejectBtn);

      expect(screen.queryByTestId('confirm-reject-dialog')).not.toBeInTheDocument();
      expect(mockClient.patch).not.toHaveBeenCalled();
    });

    it('cancels AdminVoidDialog and ChefVoidDialog without submitting', async () => {
      const inPrepOrder: Order = {
        ...mockOrder1,
        id: 'ord-dialog-cancel',
        orderId: 'ord-dialog-cancel',
        status: OrderStatus.IN_PREPARATION,
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([inPrepOrder]),
        patch: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} userRole="admin" />);

      await waitFor(() => {
        expect(screen.getByTestId('order-action-admin-void-ord-dialog-cancel')).toBeInTheDocument();
      });

      // Open AdminVoidDialog and cancel
      fireEvent.click(screen.getByTestId('order-action-admin-void-ord-dialog-cancel'));
      expect(screen.getByTestId('admin-void-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('admin-void-cancel'));
      expect(screen.queryByTestId('admin-void-dialog')).not.toBeInTheDocument();

      // Open ChefVoidDialog and cancel
      fireEvent.click(screen.getByTestId('order-action-chef-void-ord-dialog-cancel'));
      expect(screen.getByTestId('chef-void-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('chef-void-cancel'));
      expect(screen.queryByTestId('chef-void-dialog')).not.toBeInTheDocument();

      expect(mockClient.patch).not.toHaveBeenCalled();
    });

    it('allows keeping comanda in preparation when marking last item ready without dispatching ready (User Requirement 3)', async () => {
      const orderWithTwoItems: Order = {
        ...mockOrder1,
        id: 'ord-confirm-prep',
        orderId: 'ord-confirm-prep',
        orderNumber: 42,
        status: OrderStatus.IN_PREPARATION,
        items: [
          {
            ...mockOrder1.items[0],
            id: 'item-done',
            itemId: 'item-done',
            status: ItemStatus.READY,
          },
          {
            ...mockOrder1.items[0],
            id: 'item-last-pending',
            itemId: 'item-last-pending',
            name: 'Corte Ribeye',
            status: ItemStatus.PENDING,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([orderWithTwoItems]),
        patch: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      await waitFor(() => {
        expect(screen.getByTestId('order-item-action-item-last-pending')).toBeInTheDocument();
      });

      // Click last pending item -> opens confirmation dialog
      fireEvent.click(screen.getByTestId('order-item-action-item-last-pending'));

      const dialog = await screen.findByTestId('confirm-ready-dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText('¿Marcar comanda como lista?')).toBeInTheDocument();
      expect(within(dialog).getByText('Corte Ribeye')).toBeInTheDocument();

      // Click "Mantener en preparación"
      fireEvent.click(screen.getByTestId('confirm-ready-keep-prep-btn'));

      expect(screen.queryByTestId('confirm-ready-dialog')).not.toBeInTheDocument();
      expect(mockClient.patch).not.toHaveBeenCalled();

      // Feedback message confirms order stays in preparation
      expect(await screen.findByTestId('kds-action-feedback')).toHaveTextContent(
        'Comanda #42 se mantiene en preparación',
      );
    });

    it('auto-dismisses action feedback after 5 seconds and action error after 15 seconds', async () => {
      vi.useFakeTimers();

      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn().mockRejectedValue(new Error('Fallo temporal')),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      const queryClient = createTestQueryClient();
      render(<KdsBoard client={mockClient} queryClient={queryClient} undoGracePeriodMs={0} />);

      // Wait for items to render
      await vi.waitFor(() => {
        expect(screen.getByTestId('order-action-ready-ord-101')).toBeInTheDocument();
      });

      // Trigger error
      fireEvent.click(screen.getByTestId('order-action-ready-ord-101'));

      await vi.waitFor(() => {
        expect(screen.getByTestId('kds-action-error')).toBeInTheDocument();
      });

      // Advance 15 seconds -> error auto-dismisses
      vi.advanceTimersByTime(15000);

      await vi.waitFor(() => {
        expect(screen.queryByTestId('kds-action-error')).not.toBeInTheDocument();
      });

      vi.useRealTimers();
    });

    it('opens OrderDetailsDialog when an order card header or footer is clicked', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue([mockOrder1]),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      // Initially no modal dialog
      expect(screen.queryByTestId('order-details-dialog')).not.toBeInTheDocument();

      // Click card stub
      fireEvent.click(screen.getByTestId('order-card-stub-ord-101'));

      // Modal dialog is opened
      expect(await screen.findByTestId('order-details-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('order-details-table')).toHaveTextContent('Mesa 4');

      // Click close button
      fireEvent.click(screen.getByTestId('order-details-close-btn'));
      expect(screen.queryByTestId('order-details-dialog')).not.toBeInTheDocument();
    });

    it('responsively enables compact card layout when there are more than 4 orders on the board', async () => {
      // 5 orders on screen
      const fiveOrders: Order[] = Array.from({ length: 5 }, (_, i) => ({
        ...mockOrder1,
        id: `ord-multi-${i + 1}`,
        orderId: `ord-multi-${i + 1}`,
        orderNumber: 200 + i,
      }));

      const mockClient = {
        get: vi.fn().mockResolvedValue(fiveOrders),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
          pageSize={8}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-multi-1')).toBeInTheDocument();
      });

      // With 5 orders (> 4), compact layout padding is applied (p-2 instead of p-3)
      expect(screen.getByTestId('order-card-stub-ord-multi-1')).toHaveClass('p-2');
    });

    it('keeps spacious card layout when there are 4 or fewer orders on the board', async () => {
      // 2 orders on screen (mockKdsQueue has 2 active orders)
      const mockClient = {
        get: vi.fn().mockResolvedValue(mockKdsQueue),
        post: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
          pageSize={8}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-101')).toBeInTheDocument();
      });

      // With 2 orders (<= 4), normal spacious layout padding is retained (p-3 instead of p-2)
      expect(screen.getByTestId('order-card-stub-ord-101')).toHaveClass('p-3');
    });

    it('opens ConfirmReadyDialog over OrderDetailsDialog when the last pending item is clicked from inside the dialog', async () => {
      const orderWithOnePending: Order = {
        id: 'ord-last-pending',
        orderId: 'ord-last-pending',
        orderNumber: 55,
        tableNumber: 7,
        isTakeaway: false,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        totalAmount: 120,
        createdAt: '2026-11-11T12:00:00Z',
        items: [
          {
            id: 'item-done',
            itemId: 'item-done',
            dishId: 'dish-done',
            name: 'Guacamole',
            quantity: 1,
            unitPrice: 50,
            status: ItemStatus.READY,
            station: 'frio',
            version: 1,
          },
          {
            id: 'item-last',
            itemId: 'item-last',
            dishId: 'dish-last',
            name: 'Hamburguesa',
            quantity: 1,
            unitPrice: 70,
            status: ItemStatus.PENDING,
            station: 'parrilla',
            version: 1,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([orderWithOnePending]),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({}),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
          undoGracePeriodMs={0}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-stub-ord-last-pending')).toBeInTheDocument();
      });

      // 1. Open individual order details dialog
      fireEvent.click(screen.getByTestId('order-card-stub-ord-last-pending'));
      expect(await screen.findByTestId('order-details-dialog')).toBeInTheDocument();

      // 2. Click the ready button for the last pending item inside OrderDetailsDialog
      const readyBtn = screen.getByTestId('order-details-item-action-item-last');
      expect(readyBtn).toBeInTheDocument();
      fireEvent.click(readyBtn);

      // 3. ConfirmReadyDialog must open AND be rendered on top
      expect(await screen.findByTestId('confirm-ready-dialog')).toBeInTheDocument();

      // Both dialogs exist in DOM, with ConfirmReadyDialog styled with z-[60] over OrderDetailsDialog z-50
      const detailsDialog = screen.getByTestId('order-details-dialog');
      const confirmDialog = screen.getByTestId('confirm-ready-dialog');
      expect(detailsDialog).toHaveClass('z-50');
      expect(confirmDialog).toHaveClass('z-[60]');

      // 4. Confirming via ConfirmReadyDialog dispatches order ready and leaves OrderDetailsDialog intact
      fireEvent.click(screen.getByTestId('confirm-ready-submit-btn'));
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-ready-dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('order-details-dialog')).toBeInTheDocument();
    });

    it('rejects a returned redo item via ConfirmRejectDialog with accurate target item URL', async () => {
      const redoOrder: Order = {
        id: 'ord-redo-test',
        orderNumber: 88,
        tableNumber: 4,
        isTakeaway: false,
        status: OrderStatus.DELIVERED,
        version: 2,
        items: [
          {
            id: 'item-delivered-prev',
            itemId: 'item-delivered-prev',
            dishId: 'dish-prev',
            name: 'Papas',
            quantity: 1,
            unitPrice: 50,
            status: ItemStatus.DELIVERED,
            station: 'freidora',
            version: 1,
          },
          {
            id: 'item-redo-pending',
            itemId: 'item-redo-pending',
            dishId: 'dish-redo',
            name: 'Hamburguesa Especial',
            quantity: 1,
            unitPrice: 150,
            status: ItemStatus.PENDING,
            station: 'parrilla',
            version: 1,
          },
        ],
      };

      const mockClient = {
        get: vi.fn().mockResolvedValue([redoOrder]),
        post: vi.fn(),
        patch: vi.fn().mockResolvedValue({}),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as ApiClient;

      render(
        <KdsBoard
          client={mockClient}
          queryClient={createTestQueryClient()}
          initialView="redo"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('order-card-ord-redo-test')).toBeInTheDocument();
      });

      // 1. Click "Rechazar rehechura (Sin insumos)"
      const rejectBtn = screen.getByTestId('order-action-reject-redo-ord-redo-test');
      expect(rejectBtn).toBeInTheDocument();
      fireEvent.click(rejectBtn);

      // 2. ConfirmRejectDialog opens showing item name
      const confirmDialog = await screen.findByTestId('confirm-reject-dialog');
      expect(confirmDialog).toBeInTheDocument();
      expect(within(confirmDialog).getByText(/¿Rechazar platillo por falta de insumos\?/)).toBeInTheDocument();
      expect(within(confirmDialog).getAllByText(/Hamburguesa Especial/).length).toBeGreaterThanOrEqual(1);

      // 3. Confirm rejection
      fireEvent.click(screen.getByTestId('confirm-reject-submit-btn'));

      await waitFor(() => {
        expect(mockClient.patch).toHaveBeenCalledWith(
          '/orders/ord-redo-test/items/item-redo-pending/kitchen-reject',
          { reason: 'Insumo físico insuficiente en cocina' },
        );
      });
    });
  });
});
