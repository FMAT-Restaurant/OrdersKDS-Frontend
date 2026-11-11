import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConfirmReadyDialog } from '../../src/features/kds-board/dialogs/ConfirmReadyDialog.tsx';
import type { Order } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';

describe('ConfirmReadyDialog (User Requirement 3)', () => {
  const mockOrder: Order = {
    id: 'ord-confirm-1',
    tableNumber: 8,
    isTakeaway: false,
    orderNumber: 27,
    version: 1,
    status: OrderStatus.IN_PREPARATION,
    items: [
      {
        id: 'item-burger',
        name: 'Hamburguesa Suprema',
        quantity: 1,
        unitPrice: 150,
        status: ItemStatus.PENDING,
      },
    ],
  };

  const mockItem = mockOrder.items[0];

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <ConfirmReadyDialog
        order={mockOrder}
        item={mockItem}
        isOpen={false}
        onConfirm={vi.fn()}
        onKeepInPrep={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal details and triggers onConfirm when primary button is clicked', () => {
    const onConfirm = vi.fn();
    const onKeepInPrep = vi.fn();

    render(
      <ConfirmReadyDialog
        order={mockOrder}
        item={mockItem}
        isOpen={true}
        onConfirm={onConfirm}
        onKeepInPrep={onKeepInPrep}
      />,
    );

    expect(screen.getByTestId('confirm-ready-dialog')).toBeInTheDocument();
    expect(screen.getByText('Mesa 8 · Comanda #27')).toBeInTheDocument();
    expect(screen.getByText('Hamburguesa Suprema')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-ready-submit-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onKeepInPrep).not.toHaveBeenCalled();
  });

  it('triggers onKeepInPrep when secondary button or Escape key is pressed', () => {
    const onConfirm = vi.fn();
    const onKeepInPrep = vi.fn();

    render(
      <ConfirmReadyDialog
        order={mockOrder}
        item={mockItem}
        isOpen={true}
        onConfirm={onConfirm}
        onKeepInPrep={onKeepInPrep}
      />,
    );

    // Secondary button click
    fireEvent.click(screen.getByTestId('confirm-ready-keep-prep-btn'));
    expect(onKeepInPrep).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(screen.getByTestId('confirm-ready-dialog'), { key: 'Escape' });
    expect(onKeepInPrep).toHaveBeenCalledTimes(2);
  });

  it('renders takeaway label and handles isSubmitting loading state', () => {
    const takeawayOrder: Order = {
      ...mockOrder,
      tableNumber: null,
      isTakeaway: true,
      orderNumber: undefined,
      id: '00000000-0000-0000-0000-111122223333',
    };

    render(
      <ConfirmReadyDialog
        order={takeawayOrder}
        item={mockItem}
        isOpen={true}
        isSubmitting={true}
        onConfirm={vi.fn()}
        onKeepInPrep={vi.fn()}
      />,
    );

    expect(screen.getByText(/Para llevar · Comanda #3333/)).toBeInTheDocument();
    const submitBtn = screen.getByTestId('confirm-ready-submit-btn');
    expect(submitBtn).toHaveTextContent('Marcando...');
    expect(submitBtn).toBeDisabled();
    expect(screen.getByTestId('confirm-ready-keep-prep-btn')).toBeDisabled();
  });
});
