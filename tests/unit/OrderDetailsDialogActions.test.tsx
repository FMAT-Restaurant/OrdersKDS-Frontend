import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderDetailsDialog } from '../../src/features/kds-board/dialogs/OrderDetailsDialog.tsx';
import { resetPointerActionForTest } from '../../src/features/kds-board/pointerAction.ts';
import { OrderStatus, ItemStatus } from '../../src/shared/types/order.ts';
import type { Order } from '../../src/shared/api/schemas.ts';

const BASE_IN_PREP_ORDER: Order = {
  id: 'ord-details-actions-1',
  orderId: 'ord-details-actions-1',
  orderNumber: 77,
  status: OrderStatus.IN_PREPARATION,
  version: 1,
  tableNumber: 9,
  isTakeaway: false,
  totalAmount: 250,
  createdAt: '2026-11-11T12:00:00Z',
  inPreparationAt: '2026-11-11T12:05:00Z',
  items: [
    {
      id: 'item-det-1',
      itemId: 'item-det-1',
      dishId: 'dish-1',
      name: 'Tacos Dorados',
      quantity: 3,
      unitPrice: 50,
      status: ItemStatus.PENDING,
      station: 'freidora',
      notes: 'Bien dorados por favor',
      modifiers: ['Extra crema', 'Salsa verde'],
    },
    {
      id: 'item-det-2',
      itemId: 'item-det-2',
      dishId: 'dish-2',
      name: 'Refresco',
      quantity: 1,
      unitPrice: 30,
      status: ItemStatus.DELIVERED,
      station: 'frio',
      notes: null,
      modifiers: [],
    },
  ],
};

const BASE_RESERVED_ORDER: Order = {
  ...BASE_IN_PREP_ORDER,
  id: 'ord-details-reserved-1',
  orderId: 'ord-details-reserved-1',
  orderNumber: 88,
  status: OrderStatus.RESERVED,
  inPreparationAt: null,
};

const BASE_TAKEAWAY_ORDER: Order = {
  ...BASE_IN_PREP_ORDER,
  id: 'ord-details-takeaway-1',
  orderId: 'ord-details-takeaway-1',
  orderNumber: 99,
  tableNumber: null,
  isTakeaway: true,
};

describe('OrderDetailsDialog Detailed Action and Keyboard Suite', () => {
  it('returns null when order is null or isOpen is false', () => {
    const { container: closedContainer } = render(
      <OrderDetailsDialog order={BASE_IN_PREP_ORDER} isOpen={false} onClose={vi.fn()} />,
    );
    expect(closedContainer).toBeEmptyDOMElement();

    const { container: nullOrderContainer } = render(
      <OrderDetailsDialog order={null} isOpen={true} onClose={vi.fn()} />,
    );
    expect(nullOrderContainer).toBeEmptyDOMElement();
  });

  describe('Void Actions and Role Permissions', () => {
    it('allows Admin to trigger Admin Void and Chef Void via click and keyboard', () => {
      const handleAdminVoid = vi.fn();
      const handleChefVoid = vi.fn();
      const handleClose = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={handleClose}
          userRole="admin"
          onAdminVoid={handleAdminVoid}
          onChefVoid={handleChefVoid}
        />,
      );

      const adminVoidBtn = screen.getByTestId('order-details-action-admin-void');
      const chefVoidBtn = screen.getByTestId('order-details-action-chef-void');
      expect(adminVoidBtn).toBeInTheDocument();
      expect(chefVoidBtn).toBeInTheDocument();

      // Click Admin Void -> triggers callback and closes modal
      resetPointerActionForTest();
      fireEvent.click(adminVoidBtn);
      expect(handleAdminVoid).toHaveBeenCalledWith(BASE_IN_PREP_ORDER);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Click Chef Void -> triggers callback and closes modal
      resetPointerActionForTest();
      fireEvent.click(chefVoidBtn);
      expect(handleChefVoid).toHaveBeenCalledWith(BASE_IN_PREP_ORDER);
      expect(handleClose).toHaveBeenCalledTimes(2);

      // Keyboard Enter on Chef Void -> triggers callback and closes modal
      fireEvent.keyDown(chefVoidBtn, { key: 'Enter' });
      expect(handleChefVoid).toHaveBeenCalledTimes(2);
      expect(handleClose).toHaveBeenCalledTimes(3);

      // Space on Admin Void
      fireEvent.keyDown(adminVoidBtn, { key: ' ' });
      expect(handleAdminVoid).toHaveBeenCalledTimes(2);

      // Other key does not trigger
      fireEvent.keyDown(chefVoidBtn, { key: 'Escape' });
      expect(handleChefVoid).toHaveBeenCalledTimes(2);
    });

    it('shows only Chef Void for chef role, and neither for waiter role', () => {
      const handleAdminVoid = vi.fn();
      const handleChefVoid = vi.fn();

      const { rerender } = render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          userRole="chef"
          onAdminVoid={handleAdminVoid}
          onChefVoid={handleChefVoid}
        />,
      );

      expect(screen.queryByTestId('order-details-action-admin-void')).not.toBeInTheDocument();
      expect(screen.getByTestId('order-details-action-chef-void')).toBeInTheDocument();

      // Switch to waiter role
      rerender(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          userRole="waiter"
          onAdminVoid={handleAdminVoid}
          onChefVoid={handleChefVoid}
        />,
      );

      expect(screen.queryByTestId('order-details-action-admin-void')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-details-action-chef-void')).not.toBeInTheDocument();
    });
  });

  describe('Reserved Order Actions and Keyboard Handling', () => {
    it('executes Start Preparation and Reject Supplies via click and keyboard Enter/Space', () => {
      const handleStartPrep = vi.fn();
      const handleRejectSupplies = vi.fn();
      const handleClose = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_RESERVED_ORDER}
          isOpen={true}
          onClose={handleClose}
          onStartPreparation={handleStartPrep}
          onRejectSupplies={handleRejectSupplies}
        />,
      );

      const startBtn = screen.getByTestId('order-details-action-start');
      const rejectBtn = screen.getByTestId('order-details-action-reject');

      // Click Start Preparation
      fireEvent.click(startBtn);
      expect(handleStartPrep).toHaveBeenCalledWith(BASE_RESERVED_ORDER);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Enter key on Start Preparation
      fireEvent.keyDown(startBtn, { key: 'Enter' });
      expect(handleStartPrep).toHaveBeenCalledTimes(2);

      // Space key on Reject Supplies
      fireEvent.keyDown(rejectBtn, { key: ' ' });
      expect(handleRejectSupplies).toHaveBeenCalledWith(BASE_RESERVED_ORDER);
      expect(handleClose).toHaveBeenCalledTimes(3);

      // Tab key should not trigger
      fireEvent.keyDown(startBtn, { key: 'Tab' });
      expect(handleStartPrep).toHaveBeenCalledTimes(2);
    });
  });

  describe('Order Ready and Undo Order Ready Actions', () => {
    it('executes Mark Order Ready via click and keyboard Enter/Space', () => {
      const handleMarkReady = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          onMarkOrderReady={handleMarkReady}
        />,
      );

      const readyBtn = screen.getByTestId('order-details-action-ready');

      fireEvent.click(readyBtn);
      expect(handleMarkReady).toHaveBeenCalledWith(BASE_IN_PREP_ORDER);

      fireEvent.keyDown(readyBtn, { key: 'Enter' });
      expect(handleMarkReady).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(readyBtn, { key: ' ' });
      expect(handleMarkReady).toHaveBeenCalledTimes(3);
    });

    it('renders undo order banner and triggers onUndoOrderReady via click and keyboard', () => {
      const handleUndoOrder = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          isPendingUndoOrder={true}
          undoOrderSecondsLeft={8}
          onUndoOrderReady={handleUndoOrder}
        />,
      );

      expect(screen.getByTestId('order-details-undo-ready-banner')).toBeInTheDocument();
      expect(screen.getByTestId('order-details-undo-countdown')).toHaveTextContent('Enviando en 8s');

      const undoBtn = screen.getByTestId('order-details-action-undo-ready');
      fireEvent.click(undoBtn);
      expect(handleUndoOrder).toHaveBeenCalledWith(BASE_IN_PREP_ORDER);

      fireEvent.keyDown(undoBtn, { key: 'Enter' });
      expect(handleUndoOrder).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(undoBtn, { key: ' ' });
      expect(handleUndoOrder).toHaveBeenCalledTimes(3);
    });
  });

  describe('Item Interactions, Modifiers, Notes, and Redo', () => {
    it('handles item keyboard Enter/Space to mark item ready', () => {
      const handleItemReady = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          onItemReady={handleItemReady}
        />,
      );

      const itemToggle = screen.getByTestId('order-details-item-action-item-det-1');

      fireEvent.keyDown(itemToggle, { key: 'Enter' });
      expect(handleItemReady).toHaveBeenCalledWith(
        BASE_IN_PREP_ORDER,
        BASE_IN_PREP_ORDER.items[0],
      );

      fireEvent.keyDown(itemToggle, { key: ' ' });
      expect(handleItemReady).toHaveBeenCalledTimes(2);
    });

    it('handles item undo banner click and keyboard Enter/Space', () => {
      const handleUndoItem = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
          pendingUndoItem={{
            orderId: BASE_IN_PREP_ORDER.id!,
            itemId: 'item-det-1',
            secondsLeft: 11,
          }}
          onUndoItemReady={handleUndoItem}
        />,
      );

      expect(screen.getByTestId('order-details-item-undo-banner-item-det-1')).toBeInTheDocument();
      const undoBtn = screen.getByTestId('order-details-item-undo-item-det-1');

      fireEvent.click(undoBtn);
      expect(handleUndoItem).toHaveBeenCalledWith(
        BASE_IN_PREP_ORDER,
        BASE_IN_PREP_ORDER.items[0],
      );

      fireEvent.keyDown(undoBtn, { key: 'Enter' });
      expect(handleUndoItem).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(undoBtn, { key: ' ' });
      expect(handleUndoItem).toHaveBeenCalledTimes(3);
    });

    it('renders modifiers and notes correctly', () => {
      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByTestId('order-details-item-modifiers-item-det-1')).toBeInTheDocument();
      expect(screen.getByTestId('order-details-item-modifier-item-det-1-0')).toHaveTextContent('+ Extra crema');
      expect(screen.getByTestId('order-details-item-modifier-item-det-1-1')).toHaveTextContent('+ Salsa verde');
      expect(screen.getByTestId('order-details-item-notes-item-det-1')).toHaveTextContent('Bien dorados por favor');
    });

    it('renders redo pending badge when order is DELIVERED and item is PENDING', () => {
      const deliveredOrderWithRedo: Order = {
        ...BASE_IN_PREP_ORDER,
        status: OrderStatus.DELIVERED,
      };

      render(
        <OrderDetailsDialog
          order={deliveredOrderWithRedo}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByTestId('order-details-redo-pending-item-det-1')).toBeInTheDocument();
      expect(screen.getByTestId('order-details-redo-pending-item-det-1')).toHaveTextContent('Rehacer pendiente');
    });
  });

  describe('Table Display and Header Variations', () => {
    it('displays "Para llevar" when isTakeaway is true', () => {
      render(
        <OrderDetailsDialog
          order={BASE_TAKEAWAY_ORDER}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('Para llevar')).toBeInTheDocument();
    });

    it('handles order with null tableNumber and isTakeaway false without crashing', () => {
      const orderNoTable: Order = {
        ...BASE_IN_PREP_ORDER,
        tableNumber: null,
        isTakeaway: false,
      };

      render(
        <OrderDetailsDialog
          order={orderNoTable}
          isOpen={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText(/#77/)).toBeInTheDocument();
    });
  });

  describe('Modal Dismissal (Escape key and Close button)', () => {
    it('closes dialog on close button click and on escape key', () => {
      const handleClose = vi.fn();

      render(
        <OrderDetailsDialog
          order={BASE_IN_PREP_ORDER}
          isOpen={true}
          onClose={handleClose}
        />,
      );

      const dialog = screen.getByTestId('order-details-dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      const closeBtn = screen.getByTestId('order-details-close-btn');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(2);
    });
  });
});

