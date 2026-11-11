import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { KdsBoard } from '../../src/features/kds-board/KdsBoard.tsx';
import { OrderCard, type PendingUndoItem } from '../../src/features/kds-board/OrderCard.tsx';
import type { Order, OrderItem } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';
import type { ApiClient } from '../../src/shared/api/client.ts';
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

const mockItem1: OrderItem = {
  id: 'item-burger-1',
  itemId: 'item-burger-1',
  dishId: 'dish-1',
  name: 'Hamburguesa Doble',
  quantity: 1,
  unitPrice: 120,
  status: ItemStatus.PENDING,
  station: 'plancha',
  version: 1,
};

const mockItem2: OrderItem = {
  id: 'item-fries-1',
  itemId: 'item-fries-1',
  dishId: 'dish-2',
  name: 'Papas Especiales',
  quantity: 1,
  unitPrice: 60,
  status: ItemStatus.PENDING,
  station: 'freidora',
  version: 1,
};

const mockMultiItemOrder: Order = {
  id: 'ord-multi-100',
  orderId: 'ord-multi-100',
  orderNumber: 42,
  tableNumber: 5,
  isTakeaway: false,
  status: OrderStatus.IN_PREPARATION,
  version: 1,
  totalAmount: 180,
  items: [mockItem1, mockItem2],
  createdAt: '2026-10-19T20:00:00Z',
};

describe('TASK-40b: KDS Táctil - Ventana de Deshacer (Undo Grace Window - 15s)', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  it('renders countdown badge with 15s default and responsive Deshacer button (>= 64px) when marking an item ready', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
    });

    const readyBtn = screen.getByTestId('order-item-action-item-burger-1');
    await act(async () => {
      fireEvent.click(readyBtn);
    });

    // The HTTP PATCH is retained (NOT yet sent)
    expect(mockClient.patch).not.toHaveBeenCalled();

    // The countdown badge and Deshacer button appear on the card with 15s default
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-undo-countdown-item-burger-1')).toBeInTheDocument();
    });

    const countdown = screen.getByTestId('order-item-undo-countdown-item-burger-1');
    expect(countdown).toHaveTextContent(/Listo — pendiente de enviar \(15s\)/i);

    const undoBtn = screen.getByTestId('order-item-undo-item-burger-1');
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn).toHaveTextContent('Deshacer');

    // Touch target requirement verification (RNF-11: >= 64px width)
    expect(undoBtn).toHaveClass('min-w-[64px]');
  });

  it('cancels the ready action and sends zero HTTP requests when clicking "Deshacer"', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
        undoGracePeriodMs={15000}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
    });

    // Mark item ready
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-burger-1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-undo-item-burger-1')).toBeInTheDocument();
    });

    // Click Deshacer button before 15s elapse
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-undo-item-burger-1'));
    });

    // Feedback toast confirms cancellation
    await vi.waitFor(() => {
      expect(screen.getByTestId('kds-action-feedback')).toBeInTheDocument();
      expect(screen.getByTestId('kds-action-feedback')).toHaveTextContent(/Envío cancelado/i);
    });

    // Deshacer button and countdown disappear, regular ready button returns
    expect(screen.queryByTestId('order-item-undo-item-burger-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();

    // Advance beyond the 15s grace window
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });

    // Verify patch was NEVER called (zero HTTP / broker events)
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  it('cancels the ready action when pressing Bump Bar Backspace (UNDO_LAST_READY)', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
        undoGracePeriodMs={15000}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
    });

    // Mark item ready
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-burger-1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-undo-item-burger-1')).toBeInTheDocument();
    });

    // Press Backspace key (mapped to UNDO_LAST_READY in bump bar)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));
    });

    // Verifies cancellation toast
    await vi.waitFor(() => {
      expect(screen.getByTestId('kds-action-feedback')).toHaveTextContent(/Envío cancelado/i);
    });

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  it('dispatches the HTTP PATCH request once if the 15-second grace window expires without undo', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
        undoGracePeriodMs={15000}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-burger-1'));
    });
    expect(mockClient.patch).not.toHaveBeenCalled();

    // Advance timers by 15.1 seconds to trigger automatic sending
    await act(async () => {
      vi.advanceTimersByTime(15100);
    });

    await vi.waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledTimes(1);
      expect(mockClient.patch).toHaveBeenCalledWith(
        '/orders/ord-multi-100/items/item-burger-1/ready',
      );
    });
  });

  it('flushes previous pending item immediately if another item is marked ready', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
        undoGracePeriodMs={15000}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
      expect(screen.getByTestId('order-item-action-item-fries-1')).toBeInTheDocument();
    });

    // 1. Mark Item 1 ready
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-burger-1'));
    });
    expect(mockClient.patch).not.toHaveBeenCalled();

    // 2. Mark Item 2 ready while Item 1 is in grace period
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-fries-1'));
    });

    // Item 1 should have been flushed immediately
    await vi.waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith(
        '/orders/ord-multi-100/items/item-burger-1/ready',
      );
    });

    // Item 2 is now in grace window
    expect(screen.getByTestId('order-item-undo-item-fries-1')).toBeInTheDocument();
  });

  it('dispatches pending item ready immediately on window beforeunload event', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockMultiItemOrder]),
      patch: vi.fn().mockResolvedValue({ success: true }),
      post: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as ApiClient;

    render(
      <KdsBoard
        tokenProvider={validTokenProvider}
        client={mockClient}
        queryClient={queryClient}
        undoGracePeriodMs={15000}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-burger-1')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-burger-1'));
    });
    expect(mockClient.patch).not.toHaveBeenCalled();

    // User navigates away or refreshes tab
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    // Flushes immediately
    await vi.waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith(
        '/orders/ord-multi-100/items/item-burger-1/ready',
      );
    });
  });

  it('OrderCard renders responsive pending undo state and handles onUndoReady callback', () => {
    const onUndoReady = vi.fn();
    const pendingUndo: PendingUndoItem = {
      orderId: mockMultiItemOrder.id ?? 'ord-multi-100',
      itemId: 'item-burger-1',
      secondsLeft: 14,
    };

    render(
      <OrderCard
        order={mockMultiItemOrder}
        pendingUndoItem={pendingUndo}
        onUndoReady={onUndoReady}
      />,
    );

    const countdown = screen.getByTestId('order-item-undo-countdown-item-burger-1');
    expect(countdown).toHaveTextContent('Listo — pendiente de enviar (14s)');

    const undoBtn = screen.getByTestId('order-item-undo-item-burger-1');
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn).toHaveClass('min-w-[64px]');

    fireEvent.click(undoBtn);
    expect(onUndoReady).toHaveBeenCalledTimes(1);
  });
});
