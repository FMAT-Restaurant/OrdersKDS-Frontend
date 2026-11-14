import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  KDS_RESERVED_ORDER_TTL_MS,
  KDS_EXPIRED_GRACE_MS,
  getOrderTtlStatus,
  formatGraceCountdown,
} from '../../../src/features/kds-board/kdsTtl.ts';
import { KdsBoard } from '../../../src/features/kds-board/KdsBoard.tsx';
import type { Order } from '../../../src/shared/api/schemas.ts';
import { OrderStatus } from '../../../src/shared/types/order.ts';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: 'test-order-1',
    orderId: 'test-order-1',
    tableNumber: 3,
    isTakeaway: false,
    status: OrderStatus.RESERVED,
    version: 1,
    totalAmount: 150,
    items: [
      {
        id: 'item-1',
        itemId: 'item-1',
        dishId: 'dish-1',
        name: 'Tacos de Pastor',
        unitPrice: 50,
        quantity: 3,
        status: 'PENDING',
        station: 'taqueria',
      },
    ],
    ...overrides,
  };
}

describe('kdsTtl logic and calculations (TASK-TTL)', () => {
  it('defines correct TTL and 10-minute grace period constants', () => {
    expect(KDS_RESERVED_ORDER_TTL_MS).toBe(15 * 60 * 1000);
    expect(KDS_EXPIRED_GRACE_MS).toBe(10 * 60 * 1000);
  });

  it('formats grace countdown cleanly into user-friendly strings', () => {
    expect(formatGraceCountdown(585)).toBe('9m 45s');
    expect(formatGraceCountdown(60)).toBe('1m 00s');
    expect(formatGraceCountdown(45)).toBe('45s');
    expect(formatGraceCountdown(0)).toBe('0s');
  });

  it('returns completely eliminated if order.status is EXPIRED', () => {
    const order = makeOrder({ status: OrderStatus.EXPIRED });
    const status = getOrderTtlStatus(order);
    expect(status.isExpired).toBe(true);
    expect(status.isCompletelyEliminated).toBe(true);
    expect(status.secondsUntilRemoval).toBe(0);
  });

  it('returns false if order status is not RESERVED', () => {
    const order = makeOrder({ status: OrderStatus.IN_PREPARATION });
    const status = getOrderTtlStatus(order);
    expect(status.isExpired).toBe(false);
    expect(status.isCompletelyEliminated).toBe(false);
  });

  it('returns false if reserved order has no stock_reserved_at timestamp', () => {
    const order = makeOrder({ stock_reserved_at: undefined, stockReservedAt: undefined });
    const status = getOrderTtlStatus(order);
    expect(status.isExpired).toBe(false);
    expect(status.isCompletelyEliminated).toBe(false);
  });

  it('returns false if reserved order has invalid timestamp string', () => {
    const order = makeOrder({ stock_reserved_at: 'invalid-date' });
    const status = getOrderTtlStatus(order);
    expect(status.isExpired).toBe(false);
    expect(status.isCompletelyEliminated).toBe(false);
  });

  it('indicates active order when elapsed time < 15 minutes', () => {
    const now = 1000000000;
    const reservedAt = new Date(now - 10 * 60 * 1000).toISOString(); // 10 min ago
    const order = makeOrder({ stock_reserved_at: reservedAt });
    const status = getOrderTtlStatus(order, now);

    expect(status.isExpired).toBe(false);
    expect(status.isCompletelyEliminated).toBe(false);
    expect(status.secondsUntilRemoval).toBe(0);
  });

  it('indicates expired order within 10-minute grace period (15m <= elapsed < 25m)', () => {
    const now = 1000000000;
    const reservedAt = new Date(now - 18 * 60 * 1000).toISOString(); // 18 min ago (3m into grace)
    const order = makeOrder({ stock_reserved_at: reservedAt });
    const status = getOrderTtlStatus(order, now);

    expect(status.isExpired).toBe(true);
    expect(status.isCompletelyEliminated).toBe(false);
    // 25m - 18m = 7 minutes remaining = 420 seconds
    expect(status.secondsUntilRemoval).toBe(7 * 60);
  });

  it('indicates completely eliminated order after 25 minutes (elapsed >= ttl + grace)', () => {
    const now = 1000000000;
    const reservedAt = new Date(now - 26 * 60 * 1000).toISOString(); // 26 min ago
    const order = makeOrder({ stock_reserved_at: reservedAt });
    const status = getOrderTtlStatus(order, now);

    expect(status.isExpired).toBe(true);
    expect(status.isCompletelyEliminated).toBe(true);
    expect(status.secondsUntilRemoval).toBe(0);
  });
});

describe('KdsBoard Caducados tab and phantom count prevention', () => {
  it('renders Caducados tab with exact badge count and moves expired orders to Caducados', async () => {
    const queryClient = createQueryClient();
    const now = Date.now();

    // 1 active comanda (< 15 min)
    const activeOrder = makeOrder({
      id: 'ord-active-1',
      orderId: 'ord-active-1',
      orderNumber: 1,
      status: OrderStatus.RESERVED,
      stock_reserved_at: new Date(now - 5 * 60 * 1000).toISOString(),
    });

    // 1 comanda expired past 25 min (eliminated from Pendientes, present in Caducados)
    const expiredOrder = makeOrder({
      id: 'ord-caducada-1',
      orderId: 'ord-caducada-1',
      orderNumber: 2,
      status: OrderStatus.RESERVED,
      stock_reserved_at: new Date(now - 30 * 60 * 1000).toISOString(),
    });

    const mockClient = {
      get: vi.fn().mockResolvedValue([activeOrder, expiredOrder]),
      patch: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as NonNullable<Parameters<typeof KdsBoard>[0]['client']>;

    render(
      <KdsBoard client={mockClient} queryClient={queryClient} initialView="pending" />,
    );

    // Initial tab is "Pendientes"
    // Badge for "Pendientes" must be 1 (only active, no phantom 2)
    const pendingBadge = await screen.findByTestId('pending-badge');
    expect(pendingBadge).toHaveTextContent('1');

    // Badge for "Caducados" must be 1
    const expiredBadge = await screen.findByTestId('expired-badge');
    expect(expiredBadge).toHaveTextContent('1');

    // Header tablist and station selector adapt via wrap without forcing horizontal scroll
    expect(screen.getByRole('tablist', { name: 'Vistas KDS' })).not.toHaveClass('overflow-x-auto');
    expect(screen.getByRole('radiogroup', { name: 'Selector de estaciones' })).not.toHaveClass(
      'overflow-x-auto',
    );

    // On Pendientes tab, only active order is displayed
    expect(screen.getByTestId('order-card-ord-active-1')).toBeInTheDocument();
    expect(screen.queryByTestId('order-card-ord-caducada-1')).not.toBeInTheDocument();

    // Switch to "Caducados" tab
    const caducadosTab = screen.getByTestId('tab-expired');
    fireEvent.click(caducadosTab);

    // Now expired order is displayed in Caducados with kitchen-friendly message (no TTL jargon)
    expect(await screen.findByTestId('order-card-ord-caducada-1')).toBeInTheDocument();
    expect(screen.getByTestId('order-ttl-expired-alert-ord-caducada-1')).toHaveTextContent(
      'Comanda caducada por tiempo agotado para Inicio de Preparación',
    );
    expect(screen.queryByTestId('order-card-ord-active-1')).not.toBeInTheDocument();

    // In Caducados, recovery/start/ready/item-ready actions are blocked; only "Rechazar insumo" is allowed
    expect(screen.queryByTestId('order-action-recover-ord-caducada-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-action-start-ord-caducada-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-action-ready-ord-caducada-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-item-action-item-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('order-action-reject-ord-caducada-1')).toBeInTheDocument();
  });

  it('keeps OrderDetailsDialog read-only (no start prep or item ready) in Caducados and executes kitchen-reject flow', async () => {
    const queryClient = createQueryClient();
    const now = Date.now();

    const expiredOrder = makeOrder({
      id: 'ord-caducada-dialog',
      orderId: 'ord-caducada-dialog',
      orderNumber: 7,
      status: OrderStatus.RESERVED,
      stock_reserved_at: new Date(now - 30 * 60 * 1000).toISOString(),
    });

    const mockClient = {
      get: vi.fn().mockResolvedValue([expiredOrder]),
      patch: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as NonNullable<Parameters<typeof KdsBoard>[0]['client']>;

    render(
      <KdsBoard client={mockClient} queryClient={queryClient} initialView="expired" />,
    );

    const cardStub = await screen.findByTestId('order-card-stub-ord-caducada-dialog');
    const kdsGrid = screen.getByTestId('kds-grid');
    expect(kdsGrid).toHaveClass('overflow-y-auto');

    // Pressing Enter on an expired card must open details, NOT start preparation
    fireEvent.keyDown(cardStub, { key: 'Enter' });

    expect(await screen.findByTestId('order-details-dialog')).toBeInTheDocument();
    expect(kdsGrid).toHaveClass('overflow-y-hidden');
    expect(screen.getByTestId('order-details-ttl-expired-alert')).toHaveTextContent(
      'Comanda caducada por tiempo agotado para Inicio de Preparación',
    );
    expect(screen.queryByTestId('order-details-action-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-details-action-ready')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-details-item-action-item-1')).not.toBeInTheDocument();

    // Only Rechazar insumo is enabled in the modal footer; clicking it follows the kitchen-reject flow
    const modalRejectBtn = screen.getByTestId('order-details-action-reject');
    fireEvent.click(modalRejectBtn);

    const confirmRejectBtn = await screen.findByTestId('confirm-reject-submit-btn');
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith(
        '/orders/ord-caducada-dialog/items/item-1/kitchen-reject',
        { reason: 'Insumo físico insuficiente en cocina' },
      );
    });
  });

  it('dispatches kitchen-reject directly from Caducados card through ConfirmRejectDialog', async () => {
    const queryClient = createQueryClient();
    const now = Date.now();

    const expiredOrder = makeOrder({
      id: 'ord-caducada-reject',
      orderId: 'ord-caducada-reject',
      orderNumber: 8,
      status: OrderStatus.RESERVED,
      stock_reserved_at: new Date(now - 30 * 60 * 1000).toISOString(),
    });

    const mockClient = {
      get: vi.fn().mockResolvedValue([expiredOrder]),
      patch: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as NonNullable<Parameters<typeof KdsBoard>[0]['client']>;

    render(
      <KdsBoard client={mockClient} queryClient={queryClient} initialView="expired" />,
    );

    const rejectBtn = await screen.findByTestId('order-action-reject-ord-caducada-reject');
    fireEvent.click(rejectBtn);

    const confirmRejectBtn = await screen.findByTestId('confirm-reject-submit-btn');
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(mockClient.patch).toHaveBeenCalledWith(
        '/orders/ord-caducada-reject/items/item-1/kitchen-reject',
        { reason: 'Insumo físico insuficiente en cocina' },
      );
    });
  });

  it('displays "No hay comandas caducadas" empty state when Caducados is empty', async () => {
    const queryClient = createQueryClient();
    const now = Date.now();

    const activeOrder = makeOrder({
      id: 'ord-active-1',
      orderId: 'ord-active-1',
      status: OrderStatus.RESERVED,
      stock_reserved_at: new Date(now - 2 * 60 * 1000).toISOString(),
    });

    const mockClient = {
      get: vi.fn().mockResolvedValue([activeOrder]),
      patch: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as NonNullable<Parameters<typeof KdsBoard>[0]['client']>;

    render(
      <KdsBoard client={mockClient} queryClient={queryClient} initialView="expired" />,
    );

    expect(await screen.findByText('No hay comandas caducadas')).toBeInTheDocument();
  });
});

