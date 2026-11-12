import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderCard } from '../../../src/features/kds-board/OrderCard.tsx';
import { OrderDetailsDialog } from '../../../src/features/kds-board/dialogs/OrderDetailsDialog.tsx';
import { resetPointerActionForTest } from '../../../src/features/kds-board/pointerAction.ts';
import { OrderStatus, ItemStatus } from '../../../src/shared/types/order.ts';
import type { Order } from '../../../src/shared/api/schemas.ts';

const REDO_ORDER: Order = {
  id: 'ord-redo-test-1',
  orderId: 'ord-redo-test-1',
  orderNumber: 101,
  status: OrderStatus.DELIVERED,
  version: 3,
  tableNumber: 4,
  isTakeaway: false,
  totalAmount: 180,
  createdAt: '2026-11-11T14:00:00Z',
  inPreparationAt: '2026-11-11T14:05:00Z',
  items: [
    {
      id: 'redo-item-1',
      itemId: 'redo-item-1',
      dishId: 'dish-redo-1',
      name: 'Sopa de Lima',
      quantity: 1,
      unitPrice: 90,
      status: ItemStatus.PENDING,
      station: 'cocina',
      notes: 'Sin cilantro por favor',
      modifiers: ['Extra lima'],
    },
    {
      id: 'redo-item-2',
      itemId: 'redo-item-2',
      dishId: 'dish-redo-2',
      name: 'Panuchos',
      quantity: 2,
      unitPrice: 45,
      status: ItemStatus.DELIVERED,
      station: 'comal',
      notes: null,
      modifiers: [],
    },
  ],
};

describe('Redo Item Rejection Actions (OrderCard & OrderDetailsDialog)', () => {
  describe('OrderCard Redo Rejection', () => {
    it('renders "Sin insumos" buttons on item and card level, and executes onRejectSupplies via click and keyboard', () => {
      const handleRejectSupplies = vi.fn();

      render(
        <OrderCard
          order={REDO_ORDER}
          onRejectSupplies={handleRejectSupplies}
        />,
      );

      // 1. Item-level reject redo button
      const itemRejectBtn = screen.getByTestId('order-item-reject-redo-redo-item-1');
      expect(itemRejectBtn).toBeInTheDocument();
      expect(itemRejectBtn).toHaveTextContent('Sin insumos');

      resetPointerActionForTest();
      fireEvent.click(itemRejectBtn);
      expect(handleRejectSupplies).toHaveBeenCalledWith(REDO_ORDER, REDO_ORDER.items[0]);

      fireEvent.keyDown(itemRejectBtn, { key: 'Enter' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(itemRejectBtn, { key: ' ' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(3);

      // Other key does not trigger
      fireEvent.keyDown(itemRejectBtn, { key: 'Tab' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(3);

      // 2. Card-level bottom reject redo action button
      const cardRejectBtn = screen.getByTestId('order-action-reject-redo-ord-redo-test-1');
      expect(cardRejectBtn).toBeInTheDocument();
      expect(cardRejectBtn).toHaveTextContent('Rechazar rehechura (Sin insumos)');

      resetPointerActionForTest();
      fireEvent.click(cardRejectBtn);
      expect(handleRejectSupplies).toHaveBeenCalledWith(
        REDO_ORDER,
        REDO_ORDER.items[0],
      );

      fireEvent.keyDown(cardRejectBtn, { key: 'Enter' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(5);

      fireEvent.keyDown(cardRejectBtn, { key: ' ' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(6);

      fireEvent.keyDown(cardRejectBtn, { key: 'Escape' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(6);
    });

    it('disables card-level redo button when pendingAction is "reject"', () => {
      render(
        <OrderCard
          order={REDO_ORDER}
          pendingAction="reject"
          onRejectSupplies={vi.fn()}
        />,
      );

      const cardRejectBtn = screen.getByTestId('order-action-reject-redo-ord-redo-test-1');
      expect(cardRejectBtn).toBeDisabled();
    });

    it('disables item redo button when pendingAction is item-specific', () => {
      render(
        <OrderCard
          order={REDO_ORDER}
          pendingAction="item:redo-item-1"
          onRejectSupplies={vi.fn()}
        />,
      );

      const itemRejectBtn = screen.getByTestId('order-item-reject-redo-redo-item-1');
      expect(itemRejectBtn).toBeDisabled();
    });
  });

  describe('OrderDetailsDialog Redo Rejection', () => {
    it('renders item reject button and dialog-level reject button, triggering callback and close', () => {
      const handleRejectSupplies = vi.fn();
      const handleClose = vi.fn();

      render(
        <OrderDetailsDialog
          order={REDO_ORDER}
          isOpen={true}
          onClose={handleClose}
          onRejectSupplies={handleRejectSupplies}
        />,
      );

      // Badge should be visible
      expect(screen.getByTestId('order-details-redo-pending-redo-item-1')).toBeInTheDocument();

      // 1. Item-level reject redo
      const itemRejectBtn = screen.getByTestId('order-details-item-reject-redo-redo-item-1');
      expect(itemRejectBtn).toBeInTheDocument();

      resetPointerActionForTest();
      fireEvent.click(itemRejectBtn);
      expect(handleRejectSupplies).toHaveBeenCalledWith(REDO_ORDER, REDO_ORDER.items[0]);

      fireEvent.keyDown(itemRejectBtn, { key: 'Enter' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(itemRejectBtn, { key: ' ' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(3);

      fireEvent.keyDown(itemRejectBtn, { key: 'Tab' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(3);

      // 2. Dialog-level bottom action
      const dialogRejectBtn = screen.getByTestId('order-details-action-reject-redo');
      expect(dialogRejectBtn).toBeInTheDocument();

      resetPointerActionForTest();
      fireEvent.click(dialogRejectBtn);
      expect(handleRejectSupplies).toHaveBeenCalledWith(REDO_ORDER, REDO_ORDER.items[0]);
      expect(handleClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(dialogRejectBtn, { key: 'Enter' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(5);
      expect(handleClose).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(dialogRejectBtn, { key: ' ' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(6);
      expect(handleClose).toHaveBeenCalledTimes(3);

      fireEvent.keyDown(dialogRejectBtn, { key: 'Escape' });
      expect(handleRejectSupplies).toHaveBeenCalledTimes(6);
    });

    it('disables dialog-level redo reject when pendingAction is "reject"', () => {
      render(
        <OrderDetailsDialog
          order={REDO_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          pendingAction="reject"
          onRejectSupplies={vi.fn()}
        />,
      );

      const dialogRejectBtn = screen.getByTestId('order-details-action-reject-redo');
      expect(dialogRejectBtn).toBeDisabled();
    });
  });
});

