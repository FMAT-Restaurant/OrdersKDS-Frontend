import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderCard } from '../../src/features/kds-board/OrderCard.tsx';
import { OrderStatus, ItemStatus } from '../../src/shared/types/order.ts';
import type { Order } from '../../src/shared/api/schemas.ts';

const SAMPLE_IN_PREP_ORDER: Order = {
  id: 'ord-keyboard-test-1',
  orderId: 'ord-keyboard-test-1',
  orderNumber: 42,
  status: OrderStatus.IN_PREPARATION,
  version: 1,
  tableNumber: 5,
  isTakeaway: false,
  totalAmount: 120,
  createdAt: '2026-11-11T12:00:00Z',
  inPreparationAt: '2026-11-11T12:01:00Z',
  items: [
    {
      id: 'item-keyboard-1',
      itemId: 'item-keyboard-1',
      dishId: 'dish-1',
      name: 'Enchiladas Suizas',
      quantity: 1,
      unitPrice: 120,
      status: ItemStatus.PENDING,
      station: 'caliente',
      notes: null,
      modifiers: [],
    },
  ],
};

describe('OrderCard Keyboard Undo Handlers (TASK-40b)', () => {
  it('triggers onUndoOrderReady via Enter and Space keys on the order undo banner', () => {
    const handleUndoOrder = vi.fn();

    render(
      <OrderCard
        order={SAMPLE_IN_PREP_ORDER}
        isPendingUndoOrder={true}
        undoOrderSecondsLeft={12}
        onUndoOrderReady={handleUndoOrder}
      />,
    );

    const undoButton = screen.getByTestId('order-action-undo-ready-ord-keyboard-test-1');
    expect(undoButton).toBeInTheDocument();

    // Click should trigger onUndo
    fireEvent.click(undoButton);
    expect(handleUndoOrder).toHaveBeenCalledTimes(1);

    // Keydown other key (e.g. Tab) should NOT trigger
    fireEvent.keyDown(undoButton, { key: 'Tab' });
    expect(handleUndoOrder).toHaveBeenCalledTimes(1);

    // Keydown Enter should trigger
    fireEvent.keyDown(undoButton, { key: 'Enter' });
    expect(handleUndoOrder).toHaveBeenCalledTimes(2);

    // Keydown Space should trigger
    fireEvent.keyDown(undoButton, { key: ' ' });
    expect(handleUndoOrder).toHaveBeenCalledTimes(3);
  });

  it('triggers onUndoItemReady via Enter and Space keys on the item undo banner', () => {
    const handleUndoItem = vi.fn();

    render(
      <OrderCard
        order={SAMPLE_IN_PREP_ORDER}
        pendingUndoItem={{
          orderId: 'ord-keyboard-test-1',
          itemId: 'item-keyboard-1',
          secondsLeft: 10,
        }}
        onUndoReady={handleUndoItem}
      />,
    );

    const itemUndoButton = screen.getByTestId('order-item-undo-item-keyboard-1');
    expect(itemUndoButton).toBeInTheDocument();

    // Click should trigger onUndo
    fireEvent.click(itemUndoButton);
    expect(handleUndoItem).toHaveBeenCalledTimes(1);

    // Other key (e.g. Escape) should NOT trigger
    fireEvent.keyDown(itemUndoButton, { key: 'Escape' });
    expect(handleUndoItem).toHaveBeenCalledTimes(1);

    // Enter key should trigger
    fireEvent.keyDown(itemUndoButton, { key: 'Enter' });
    expect(handleUndoItem).toHaveBeenCalledTimes(2);
    expect(handleUndoItem).toHaveBeenCalledWith(
      SAMPLE_IN_PREP_ORDER,
      SAMPLE_IN_PREP_ORDER.items[0],
    );

    // Space key should trigger
    fireEvent.keyDown(itemUndoButton, { key: ' ' });
    expect(handleUndoItem).toHaveBeenCalledTimes(3);
  });
});

