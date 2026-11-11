import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConfirmRejectDialog } from '../../src/features/kds-board/dialogs/ConfirmRejectDialog.tsx';
import type { Order } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';

describe('ConfirmRejectDialog', () => {
  const mockOrder: Order = {
    id: 'ord-reject-1',
    tableNumber: 12,
    isTakeaway: false,
    orderNumber: 45,
    version: 1,
    status: OrderStatus.RESERVED,
    items: [
      {
        id: 'item-ribeye',
        name: 'Ribeye 400g',
        quantity: 1,
        unitPrice: 320,
        status: ItemStatus.PENDING,
      },
    ],
  };

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <ConfirmRejectDialog
        order={mockOrder}
        isOpen={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal details and triggers onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmRejectDialog
        order={mockOrder}
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId('confirm-reject-dialog')).toBeInTheDocument();
    expect(screen.getByText('Mesa 12 · Comanda #45')).toBeInTheDocument();
    expect(screen.getByText('¿Rechazar comanda por falta de insumos?')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-reject-submit-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('triggers onCancel when cancel button or Escape key is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmRejectDialog
        order={mockOrder}
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Cancel button click
    fireEvent.click(screen.getByTestId('confirm-reject-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(screen.getByTestId('confirm-reject-dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('renders takeaway label and handles isSubmitting loading state', () => {
    const takeawayOrder: Order = {
      ...mockOrder,
      tableNumber: null,
      isTakeaway: true,
      orderNumber: undefined,
      id: '00000000-0000-0000-0000-999988887777',
    };

    render(
      <ConfirmRejectDialog
        order={takeawayOrder}
        isOpen={true}
        isSubmitting={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Para llevar · Comanda #7777/)).toBeInTheDocument();
    const submitBtn = screen.getByTestId('confirm-reject-submit-btn');
    expect(submitBtn).toHaveTextContent('Rechazando...');
    expect(submitBtn).toBeDisabled();
    expect(screen.getByTestId('confirm-reject-cancel-btn')).toBeDisabled();
  });
});

