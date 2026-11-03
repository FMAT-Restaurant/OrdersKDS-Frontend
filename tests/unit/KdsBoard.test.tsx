import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
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
import {
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
      const mainGrid = screen.getByRole('region', { name: /KDS Order Cards Grid/i });
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
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 3');
      });

      // Navigate to page 2
      fireEvent.click(screen.getByTestId('pagination-next'));
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 3');

      // Switch tab to Delivered
      fireEvent.click(screen.getByTestId('tab-delivered'));

      await waitFor(() => {
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 1');
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
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 3');
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
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 3');
      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeEnabled();

      // Page 2 cards: ord-204 to ord-207
      expect(screen.queryByTestId('order-card-stub-ord-200')).not.toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-204')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-207')).toBeInTheDocument();

      // Tap Next -> page 3 (last page)
      fireEvent.click(nextBtn);
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 3 of 3');
      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeDisabled();

      // Page 3 cards: ord-208 and ord-209
      expect(screen.getByTestId('order-card-stub-ord-208')).toBeInTheDocument();
      expect(screen.getByTestId('order-card-stub-ord-209')).toBeInTheDocument();

      // Tap Previous -> back to page 2
      fireEvent.click(prevBtn);
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 3');
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
        expect(screen.getByTestId('kds-empty')).toHaveTextContent('No orders in this view');
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
        expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 3');
      });

      // ArrowRight maps to FOCUS_NEXT_ORDER in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 3');

      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 3 of 3');

      // ArrowLeft maps to FOCUS_PREVIOUS_ORDER in BUMP_BAR_KEY_MAP
      fireEvent.keyDown(window, { code: 'ArrowLeft' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 3');
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

      expect(screen.getByTestId('kds-error')).toHaveTextContent('Failed to load queue:');
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
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 1');
      fireEvent.keyDown(window, { code: 'ArrowLeft' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 1');

      // Switch back to general (2 orders, pageSize 1 -> 2 pages)
      fireEvent.click(screen.getByTestId('station-tab-general'));
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 1 of 2');

      // Advance to page 2 (last page)
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 2');

      // At last page, ArrowRight must remain at page 2
      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 2');

      // Unrecognized action hits default branch safely
      fireEvent.keyDown(window, { code: 'Backspace' });
      expect(screen.getByTestId('kds-page-info')).toHaveTextContent('Page 2 of 2');
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
});
