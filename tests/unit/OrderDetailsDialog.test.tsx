/**
 * @file OrderDetailsDialog.test.tsx
 * @description Unit tests for OrderDetailsDialog (TASK-15, TASK-40b, OP-06, WCAG AA).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { OrderDetailsDialog } from '../../src/features/kds-board/dialogs/OrderDetailsDialog.tsx';
import type { Order } from '../../src/shared/api/schemas.ts';

describe('OrderDetailsDialog Component Suite', () => {
  const mockOrder: Order = {
    id: 'ord-1234-abcd',
    orderNumber: 42,
    tableNumber: 5,
    status: 'IN_PREPARATION',
    version: 1,
    items: [
      {
        id: 'item-1',
        name: 'Tacos al Pastor',
        quantity: 3,
        unitPrice: 50.0,
        status: 'PENDING',
        modifiers: ['Sin cebolla', 'Doble piña'],
        notes: 'Bien dorada la carne',
        preparationTimeText: '12 min',
      },
      {
        id: 'item-2',
        name: 'Agua de Horchata',
        quantity: 1,
        unitPrice: 30.0,
        status: 'READY',
      },
    ],
    createdAt: '2026-10-31T12:00:00Z',
    inPreparationAt: '2026-10-31T12:02:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render anything when isOpen is false or order is null', () => {
    const { rerender } = render(
      <OrderDetailsDialog order={mockOrder} isOpen={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('order-details-dialog')).not.toBeInTheDocument();

    rerender(<OrderDetailsDialog order={null} isOpen={true} onClose={vi.fn()} />);
    expect(screen.queryByTestId('order-details-dialog')).not.toBeInTheDocument();
  });

  it('renders order header details: table number, order number, and status badge', () => {
    render(<OrderDetailsDialog order={mockOrder} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('order-details-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('order-details-table')).toHaveTextContent('Mesa 5');
    expect(screen.getByTestId('order-details-id')).toHaveTextContent('#42');
    expect(screen.getByTestId('status-badge-in_preparation')).toBeInTheDocument();
  });

  it('renders takeaway badge when tableNumber is missing and isTakeaway is true', () => {
    const takeawayOrder: Order = {
      ...mockOrder,
      tableNumber: null,
      isTakeaway: true,
    };
    render(<OrderDetailsDialog order={takeawayOrder} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('order-details-table')).toHaveTextContent('Para llevar');
  });

  it('renders all dishes with quantity, name, modifiers, and notes', () => {
    render(<OrderDetailsDialog order={mockOrder} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('order-details-item-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('order-details-item-qty-item-1')).toHaveTextContent('3x');
    expect(screen.getByTestId('order-details-item-name-item-1')).toHaveTextContent(
      'Tacos al Pastor',
    );
    expect(
      screen.getByTestId('order-details-item-prep-time-item-1'),
    ).toHaveTextContent('12 min');

    // Modifiers & notes
    expect(
      screen.getByTestId('order-details-item-modifier-item-1-0'),
    ).toHaveTextContent('+ Sin cebolla');
    expect(
      screen.getByTestId('order-details-item-modifier-item-1-1'),
    ).toHaveTextContent('+ Doble piña');
    expect(screen.getByTestId('order-details-item-notes-item-1')).toHaveTextContent(
      'Bien dorada la carne',
    );
  });

  it('calls onClose when close button (✕) or bottom Cerrar button is clicked', () => {
    const onClose = vi.fn();
    render(<OrderDetailsDialog order={mockOrder} isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('order-details-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('order-details-bottom-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<OrderDetailsDialog order={mockOrder} isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('order-details-dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onItemReady when "Marcar listo" on an item is clicked', () => {
    const onItemReady = vi.fn();
    render(
      <OrderDetailsDialog
        order={mockOrder}
        isOpen={true}
        onClose={vi.fn()}
        onItemReady={onItemReady}
      />,
    );

    const readyBtn = screen.getByTestId('order-details-item-action-item-1');
    expect(readyBtn).toHaveTextContent('Marcar listo');
    fireEvent.click(readyBtn);
    expect(onItemReady).toHaveBeenCalledTimes(1);
    expect(onItemReady).toHaveBeenCalledWith(mockOrder, mockOrder.items[0]);
  });

  it('renders item undo countdown banner when item is in pending undo state, and calls onUndoItemReady on click', () => {
    const onUndoItemReady = vi.fn();
    render(
      <OrderDetailsDialog
        order={mockOrder}
        isOpen={true}
        onClose={vi.fn()}
        onUndoItemReady={onUndoItemReady}
        pendingUndoItem={{
          orderId: 'ord-1234-abcd',
          itemId: 'item-1',
          type: 'item',
          secondsLeft: 12,
        }}
      />,
    );

    expect(
      screen.getByTestId('order-details-item-undo-countdown-item-1'),
    ).toHaveTextContent('Listo — pendiente de enviar (12s)');

    const undoBtn = screen.getByTestId('order-details-item-undo-item-1');
    fireEvent.click(undoBtn);
    expect(onUndoItemReady).toHaveBeenCalledTimes(1);
    expect(onUndoItemReady).toHaveBeenCalledWith(mockOrder, mockOrder.items[0]);
  });

  it('calls onMarkOrderReady when "Comanda lista" button is clicked', () => {
    const onMarkOrderReady = vi.fn();
    render(
      <OrderDetailsDialog
        order={mockOrder}
        isOpen={true}
        onClose={vi.fn()}
        onMarkOrderReady={onMarkOrderReady}
      />,
    );

    const markReadyBtn = screen.getByTestId('order-details-action-ready');
    expect(markReadyBtn).toHaveTextContent('Comanda lista');
    fireEvent.click(markReadyBtn);
    expect(onMarkOrderReady).toHaveBeenCalledTimes(1);
    expect(onMarkOrderReady).toHaveBeenCalledWith(mockOrder);
  });

  it('renders order ready undo banner when isPendingUndoOrder is true, and calls onUndoOrderReady', () => {
    const onUndoOrderReady = vi.fn();
    render(
      <OrderDetailsDialog
        order={mockOrder}
        isOpen={true}
        onClose={vi.fn()}
        isPendingUndoOrder={true}
        undoOrderSecondsLeft={8}
        onUndoOrderReady={onUndoOrderReady}
      />,
    );

    expect(screen.getByTestId('order-details-undo-countdown')).toHaveTextContent(
      'Enviando en 8s',
    );
    const undoBtn = screen.getByTestId('order-details-action-undo-ready');
    fireEvent.click(undoBtn);
    expect(onUndoOrderReady).toHaveBeenCalledTimes(1);
    expect(onUndoOrderReady).toHaveBeenCalledWith(mockOrder);
  });

  it('renders preparation actions when order is in RESERVED status', () => {
    const reservedOrder: Order = {
      ...mockOrder,
      status: 'RESERVED',
    };
    const onStartPreparation = vi.fn();
    const onRejectSupplies = vi.fn();
    render(
      <OrderDetailsDialog
        order={reservedOrder}
        isOpen={true}
        onClose={vi.fn()}
        onStartPreparation={onStartPreparation}
        onRejectSupplies={onRejectSupplies}
      />,
    );

    const startBtn = screen.getByTestId('order-details-action-start');
    expect(startBtn).toHaveTextContent('Iniciar preparación');
    fireEvent.click(startBtn);
    expect(onStartPreparation).toHaveBeenCalledWith(reservedOrder);

    const rejectBtn = screen.getByTestId('order-details-action-reject');
    expect(rejectBtn).toHaveTextContent('Rechazar insumo');
    fireEvent.click(rejectBtn);
    expect(onRejectSupplies).toHaveBeenCalledWith(reservedOrder);
  });

  it('enforces >= 48px touch targets for buttons in accordance with WCAG AA', () => {
    render(
      <OrderDetailsDialog
        order={mockOrder}
        isOpen={true}
        onClose={vi.fn()}
        onMarkOrderReady={vi.fn()}
      />,
    );

    const markReadyBtn = screen.getByTestId('order-details-action-ready');
    expect(markReadyBtn).toHaveStyle({ minHeight: '48px' });

    const closeBtn = screen.getByTestId('order-details-bottom-close-btn');
    expect(closeBtn).toHaveStyle({ minHeight: '48px' });

    const itemActionBtn = screen.getByTestId('order-details-item-action-item-1');
    expect(itemActionBtn).toHaveStyle({ minHeight: '48px' });
  });

  it('locks document background scroll while open and restores previous overflow on close', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';

    const { rerender, unmount } = render(
      <OrderDetailsDialog order={mockOrder} isOpen={true} onClose={vi.fn()} />,
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender(<OrderDetailsDialog order={mockOrder} isOpen={false} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('scroll');

    rerender(<OrderDetailsDialog order={mockOrder} isOpen={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('scroll');
  });
});
