import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

const mockItem3: OrderItem = {
  id: 'item-drink-1',
  itemId: 'item-drink-1',
  dishId: 'dish-3',
  name: 'Refresco Cola',
  quantity: 1,
  unitPrice: 35,
  status: ItemStatus.PENDING,
  station: 'barra',
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
  totalAmount: 215,
  items: [mockItem1, mockItem2, mockItem3],
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

  it('renders countdown badge with 15s default and responsive Deshacer button (>= 64px) when marking an entire comanda ready', async () => {
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
      expect(screen.getByTestId('order-action-ready-ord-multi-100')).toBeInTheDocument();
    });

    const readyBtn = screen.getByTestId('order-action-ready-ord-multi-100');
    await act(async () => {
      fireEvent.click(readyBtn);
    });

    // The HTTP PATCH is retained (NOT yet sent)
    expect(mockClient.patch).not.toHaveBeenCalled();

    // The countdown badge and Deshacer button appear on the card
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-undo-countdown-ord-multi-100')).toBeInTheDocument();
    });

    const countdown = screen.getByTestId('order-undo-countdown-ord-multi-100');
    expect(countdown).toHaveTextContent(/Comanda lista — enviando en 15s/i);

    const undoBtn = screen.getByTestId('order-action-undo-ready-ord-multi-100');
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn).toHaveTextContent('Deshacer');
    expect(undoBtn).toHaveClass('min-w-[64px]');
  });

  it('cancels the entire comanda ready action and sends zero HTTP requests when clicking "Deshacer"', async () => {
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
      expect(screen.getByTestId('order-action-ready-ord-multi-100')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-ready-ord-multi-100'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-action-undo-ready-ord-multi-100')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-undo-ready-ord-multi-100'));
    });

    // Verify timer is cancelled and 0 network requests sent
    expect(mockClient.patch).not.toHaveBeenCalled();

    // Verify confirmation feedback toast is displayed
    await vi.waitFor(() => {
      expect(screen.getByTestId('kds-action-feedback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kds-action-feedback')).toHaveTextContent(
      'Envío cancelado. Comanda #42 se mantiene en preparación.',
    );

    // Verify original Comanda lista button is restored
    expect(screen.getByTestId('order-action-ready-ord-multi-100')).toBeInTheDocument();
  });

  it('cancels the comanda ready action when pressing Bump Bar Backspace (UNDO_LAST_READY)', async () => {
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
      expect(screen.getByTestId('order-action-ready-ord-multi-100')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-ready-ord-multi-100'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-action-undo-ready-ord-multi-100')).toBeInTheDocument();
    });

    // Press Backspace key (mapped to UNDO_LAST_READY in bump bar)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));
    });

    // Verify timer is cancelled and zero requests sent
    expect(mockClient.patch).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(screen.getByTestId('kds-action-feedback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kds-action-feedback')).toHaveTextContent(
      'Envío cancelado. Comanda #42 se mantiene en preparación.',
    );
  });

  it('dispatches PATCH /orders/{orderId}/ready after 15s elapsed without undo', async () => {
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
      expect(screen.getByTestId('order-action-ready-ord-multi-100')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-ready-ord-multi-100'));
    });

    expect(mockClient.patch).not.toHaveBeenCalled();

    // Advance 15 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    // Verify comanda ready was dispatched to backend
    await vi.waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-multi-100/ready');
    });
  });

  it('OrderCard renders responsive pending undo state for entire order and handles onUndoOrderReady', () => {
    const onUndoOrderReady = vi.fn();

    render(
      <OrderCard
        order={mockMultiItemOrder}
        isPendingUndoOrder={true}
        undoOrderSecondsLeft={11}
        onUndoOrderReady={onUndoOrderReady}
      />,
    );

    const countdown = screen.getByTestId('order-undo-countdown-ord-multi-100');
    expect(countdown).toHaveTextContent('Comanda lista — enviando en 11s');

    const undoBtn = screen.getByTestId('order-action-undo-ready-ord-multi-100');
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn).toHaveClass('min-w-[64px]');

    fireEvent.click(undoBtn);
    expect(onUndoOrderReady).toHaveBeenCalledTimes(1);
  });

  it('enters comanda undo grace period when confirming last pending item ready dialog and supports cancellation', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockSinglePendingOrder: Order = {
      id: 'ord-single-100',
      orderId: 'ord-single-100',
      orderNumber: 43,
      tableNumber: 7,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 60,
      items: [
        {
          id: 'item-last-1',
          itemId: 'item-last-1',
          dishId: 'dish-2',
          name: 'Papas Especiales',
          quantity: 1,
          unitPrice: 60,
          status: ItemStatus.PENDING,
          station: 'freidora',
          version: 1,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockSinglePendingOrder]),
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
      expect(screen.getByTestId('order-item-action-item-last-1')).toBeInTheDocument();
    });

    // 1. Click last item ready button -> opens ConfirmReadyDialog
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-last-1'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('confirm-ready-submit-btn')).toBeInTheDocument();
    });

    // 2. Confirm in dialog ("Marcar lista")
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-ready-submit-btn'));
    });

    // The HTTP PATCH is retained in the 15-second grace period
    expect(mockClient.patch).not.toHaveBeenCalled();

    // Comanda undo banner appears on the card
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-undo-countdown-ord-single-100')).toBeInTheDocument();
    });
    expect(screen.getByTestId('order-undo-countdown-ord-single-100')).toHaveTextContent(
      /Comanda lista — enviando en 15s/i,
    );

    // Point 1: During comanda countdown, the triggering item is optimistically ready (checked and disabled)
    const itemButton = screen.getByTestId('order-item-action-item-last-1');
    expect(itemButton).toBeDisabled();
    expect(itemButton).toHaveClass('bg-emerald-50');

    // 3. Click Deshacer
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-undo-ready-ord-single-100'));
    });

    // Zero network requests sent
    expect(mockClient.patch).not.toHaveBeenCalled();

    // Point 1: After clicking Deshacer, the item reverts from "Listo" back to pending and enabled
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-action-item-last-1')).not.toBeDisabled();
    });
    expect(screen.getByTestId('order-item-action-item-last-1')).not.toHaveClass('bg-emerald-50');

    // Feedback confirms item and order remain in preparation
    await vi.waitFor(() => {
      expect(screen.getByTestId('kds-action-feedback')).toBeInTheDocument();
    });
    expect(screen.getByTestId('kds-action-feedback')).toHaveTextContent(
      'Envío cancelado. Papas Especiales se mantiene pendiente y la comanda #43 sigue en preparación.',
    );
  });

  it('activates comanda countdown when marking comanda ready after items were marked individually', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const mockOrderWithItems: Order = {
      id: 'ord-items-200',
      orderId: 'ord-items-200',
      orderNumber: 44,
      tableNumber: 8,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 120,
      items: [
        {
          id: 'item-201',
          itemId: 'item-201',
          dishId: 'dish-1',
          name: 'Tacos de Cochinita',
          quantity: 2,
          unitPrice: 50,
          status: ItemStatus.PENDING,
          station: 'cocina',
          version: 1,
        },
        {
          id: 'item-202',
          itemId: 'item-202',
          dishId: 'dish-2',
          name: 'Agua de Horchata',
          quantity: 1,
          unitPrice: 20,
          status: ItemStatus.PENDING,
          station: 'bebidas',
          version: 1,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };

    const mockClient = {
      get: vi.fn().mockResolvedValue([mockOrderWithItems]),
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
      expect(screen.getByTestId('order-action-ready-ord-items-200')).toBeInTheDocument();
    });

    // Mark individual dish item-201
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-201'));
    });

    // Item countdown is visible
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-undo-item-201')).toBeInTheDocument();
    });

    // Now cook marks comanda ready globally ("Comanda lista")
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-ready-ord-items-200'));
    });

    // Comanda countdown banner MUST activate and be visible
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-undo-countdown-ord-items-200')).toBeInTheDocument();
    });
    expect(screen.getByTestId('order-undo-countdown-ord-items-200')).toHaveTextContent(
      /Comanda lista — enviando en 15s/i,
    );

    // Both items are optimistically ready while comanda countdown is active
    expect(screen.getByTestId('order-item-action-item-201')).toBeDisabled();
    expect(screen.getByTestId('order-item-action-item-202')).toBeDisabled();
  });

  it('does NOT flush comanda countdown when marking an item on another order, but flushes pending item countdowns', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const orderA: Order = {
      id: 'ord-a',
      orderId: 'ord-a',
      orderNumber: 50,
      tableNumber: 1,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 100,
      items: [
        {
          id: 'item-a1',
          itemId: 'item-a1',
          dishId: 'dish-1',
          name: 'Platillo A1',
          quantity: 1,
          unitPrice: 100,
          status: ItemStatus.PENDING,
          station: 'cocina',
          version: 1,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };

    const orderB: Order = {
      id: 'ord-b',
      orderId: 'ord-b',
      orderNumber: 51,
      tableNumber: 2,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 100,
      items: [
        {
          id: 'item-b1',
          itemId: 'item-b1',
          dishId: 'dish-2',
          name: 'Platillo B1',
          quantity: 1,
          unitPrice: 50,
          status: ItemStatus.PENDING,
          station: 'cocina',
          version: 1,
        },
        {
          id: 'item-b2',
          itemId: 'item-b2',
          dishId: 'dish-3',
          name: 'Platillo B2',
          quantity: 1,
          unitPrice: 50,
          status: ItemStatus.PENDING,
          station: 'cocina',
          version: 1,
        },
        {
          id: 'item-b3',
          itemId: 'item-b3',
          dishId: 'dish-4',
          name: 'Platillo B3',
          quantity: 1,
          unitPrice: 50,
          status: ItemStatus.PENDING,
          station: 'cocina',
          version: 1,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };

    const mockClient = {
      get: vi.fn().mockResolvedValue([orderA, orderB]),
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
      expect(screen.getByTestId('order-action-ready-ord-a')).toBeInTheDocument();
      expect(screen.getByTestId('order-action-ready-ord-b')).toBeInTheDocument();
    });

    // 1. Put Order A into comanda ready countdown
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-action-ready-ord-a'));
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('order-undo-countdown-ord-a')).toBeInTheDocument();
    });

    // 2. Mark item-b1 on Order B
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-b1'));
    });

    // Item B1 enters its grace period
    await vi.waitFor(() => {
      expect(screen.getByTestId('order-item-undo-item-b1')).toBeInTheDocument();
    });

    // CRITICAL: Order A MUST NOT be flushed immediately!
    expect(mockClient.patch).not.toHaveBeenCalledWith('/orders/ord-a/ready');
    // Order A's comanda countdown banner is STILL in the document!
    expect(screen.getByTestId('order-undo-countdown-ord-a')).toBeInTheDocument();

    // 3. Mark item-b2 on Order B: previous item B1 MUST be flushed immediately
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-b2'));
    });

    // Item B1 was flushed and PATCH was dispatched for item B1
    await vi.waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith('/orders/ord-b/items/item-b1/ready');
    });

    // But Order A is STILL NOT flushed!
    expect(mockClient.patch).not.toHaveBeenCalledWith('/orders/ord-a/ready');
    expect(screen.getByTestId('order-undo-countdown-ord-a')).toBeInTheDocument();
  });

  it('activates ConfirmReadyDialog when pressing multiple individual dishes in rapid succession until the last dish', async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();

    const orderWithThreeItems: Order = {
      id: 'ord-triple-1',
      orderId: 'ord-triple-1',
      orderNumber: 77,
      tableNumber: 10,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 1,
      totalAmount: 300,
      items: [
        {
          id: 'item-t1',
          itemId: 'item-t1',
          name: 'Tacos al Pastor',
          quantity: 1,
          status: ItemStatus.PENDING,
          unitPrice: 100,
        },
        {
          id: 'item-t2',
          itemId: 'item-t2',
          name: 'Guacamole',
          quantity: 1,
          status: ItemStatus.PENDING,
          unitPrice: 100,
        },
        {
          id: 'item-t3',
          itemId: 'item-t3',
          name: 'Horchata',
          quantity: 1,
          status: ItemStatus.PENDING,
          unitPrice: 100,
        },
      ],
      createdAt: '2026-10-19T20:00:00Z',
    };

    const mockClient = {
      get: vi.fn().mockResolvedValue([orderWithThreeItems]),
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
      expect(screen.getByTestId('order-item-action-item-t1')).toBeInTheDocument();
      expect(screen.getByTestId('order-item-action-item-t2')).toBeInTheDocument();
      expect(screen.getByTestId('order-item-action-item-t3')).toBeInTheDocument();
    });

    // 1. Click first dish
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-t1'));
    });

    // 2. Click second dish in rapid succession
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-t2'));
    });

    // Confirmation dialog should NOT be open yet
    expect(screen.queryByTestId('confirm-ready-dialog')).not.toBeInTheDocument();

    // 3. Click third (last) dish in rapid succession
    await act(async () => {
      fireEvent.click(screen.getByTestId('order-item-action-item-t3'));
    });

    // Confirmation dialog MUST activate now!
    await vi.waitFor(() => {
      expect(screen.getByTestId('confirm-ready-dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByTestId('confirm-ready-dialog');
    expect(within(dialog).getByText(/¿Marcar comanda como lista\?/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Horchata/i)).toBeInTheDocument();
  });
});
