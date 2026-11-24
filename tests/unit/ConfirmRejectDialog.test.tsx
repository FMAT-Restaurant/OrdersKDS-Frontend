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

  it('ignores non-Escape keydown events and handles orders without table or takeaway', () => {
    const onCancel = vi.fn();
    const generalOrder: Order = {
      ...mockOrder,
      id: undefined,
      publicId: 'pub-8888',
      tableNumber: null,
      isTakeaway: false,
      orderNumber: 60,
    };

    render(
      <ConfirmRejectDialog
        order={generalOrder}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    // Header displays Comanda #60 without table prefix
    expect(screen.getByText('Comanda #60')).toBeInTheDocument();

    // Non-Escape key does not trigger onCancel
    fireEvent.keyDown(screen.getByTestId('confirm-reject-dialog'), { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders item-specific copy when an individual item is provided for redo rejection', () => {
    const onConfirm = vi.fn();
    const itemToReject = mockOrder.items[0];

    render(
      <ConfirmRejectDialog
        order={mockOrder}
        item={itemToReject}
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('¿Rechazar platillo por falta de insumos?')).toBeInTheDocument();
    expect(screen.getByText('Mesa 12 · Comanda #45 · Ribeye 400g')).toBeInTheDocument();
    expect(
      screen.getByText(/¿Estás seguro de que deseas rechazar "Ribeye 400g" por falta de insumos físicos en cocina\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-reject-submit-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows selecting partial availableQuantity when requested quantity is greater than 1', () => {
    const onConfirm = vi.fn();
    const multiOrder: Order = {
      ...mockOrder,
      items: [
        {
          ...mockOrder.items[0],
          quantity: 3,
        },
      ],
    };

    render(
      <ConfirmRejectDialog
        order={multiOrder}
        item={multiOrder.items[0]}
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const decBtn = screen.getByTestId('confirm-reject-available-dec');
    const incBtn = screen.getByTestId('confirm-reject-available-inc');
    const qtyInput = screen.getByTestId('confirm-reject-available-input');

    expect(qtyInput).toHaveValue(0);
    expect(decBtn).toBeDisabled();

    fireEvent.click(incBtn);
    fireEvent.click(incBtn);
    expect(qtyInput).toHaveValue(2);
    expect(incBtn).toBeDisabled();
    expect(
      screen.getByText('El mesero verá: Solicitados: 3, Disponibles: 2.'),
    ).toBeInTheDocument();

    fireEvent.change(qtyInput, { target: { value: '99' } });
    expect(qtyInput).toHaveValue(2);

    fireEvent.click(screen.getByTestId('confirm-reject-submit-btn'));
    expect(onConfirm).toHaveBeenCalledWith({ availableQuantity: 2 });
  });

  it('allows selecting multiple dishes with per-item available quantities on multi-item orders', () => {
    const onConfirm = vi.fn();
    const multiDishOrder: Order = {
      ...mockOrder,
      items: [
        {
          id: 'item-burger',
          name: 'Hamburguesa clásica',
          quantity: 2,
          unitPrice: 165,
          status: ItemStatus.PENDING,
        },
        {
          id: 'item-quesadilla',
          name: 'Quesadilla Oaxaca',
          quantity: 3,
          unitPrice: 115,
          status: ItemStatus.PENDING,
        },
      ],
    };

    render(
      <ConfirmRejectDialog
        order={multiDishOrder}
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('confirm-reject-items-list')).toBeInTheDocument();
    const toggleBurger = screen.getByTestId('confirm-reject-item-toggle-item-burger');
    const toggleQuesadilla = screen.getByTestId('confirm-reject-item-toggle-item-quesadilla');
    expect(toggleBurger).toBeChecked();
    expect(toggleQuesadilla).not.toBeChecked();

    // Enable the second dish and set different partial availabilities for both
    fireEvent.click(toggleQuesadilla);
    expect(toggleQuesadilla).toBeChecked();

    fireEvent.click(screen.getByTestId('confirm-reject-available-inc-item-burger'));
    fireEvent.click(screen.getByTestId('confirm-reject-available-inc-item-quesadilla'));
    fireEvent.click(screen.getByTestId('confirm-reject-available-inc-item-quesadilla'));

    fireEvent.click(screen.getByTestId('confirm-reject-submit-btn'));
    expect(onConfirm).toHaveBeenCalledWith({
      availableQuantity: 1,
      items: [
        { itemId: 'item-burger', availableQuantity: 1 },
        { itemId: 'item-quesadilla', availableQuantity: 2 },
      ],
    });

    // Unchecking all dishes disables confirm and warns user
    fireEvent.click(toggleBurger);
    fireEvent.click(toggleQuesadilla);
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona al menos un platillo afectado.');
    expect(screen.getByTestId('confirm-reject-submit-btn')).toBeDisabled();
  });
});

