import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminVoidDialog } from '../../../src/features/kds-board/dialogs/AdminVoidDialog.tsx';
import { resetPointerActionForTest } from '../../../src/features/kds-board/pointerAction.ts';
import { OrderStatus, ItemStatus } from '../../../src/shared/types/order.ts';
import type { Order } from '../../../src/shared/api/schemas.ts';

const TAKEAWAY_ORDER: Order = {
  id: 'ord-takeaway-void-1',
  orderId: 'ord-takeaway-void-1',
  orderNumber: 240,
  status: OrderStatus.IN_PREPARATION,
  version: 2,
  tableNumber: null,
  isTakeaway: true,
  totalAmount: 320,
  createdAt: '2026-11-12T00:00:00Z',
  inPreparationAt: '2026-11-12T00:02:00Z',
  items: [
    {
      id: 'it-tk-1',
      itemId: 'it-tk-1',
      dishId: 'dish-1',
      name: 'Poc Chuc Especial',
      quantity: 2,
      unitPrice: 160,
      status: ItemStatus.PENDING,
      station: 'parrilla',
      modifiers: [],
      notes: '',
    },
  ],
};

const NO_TABLE_ORDER: Order = {
  ...TAKEAWAY_ORDER,
  id: 'ord-no-table-void-2',
  orderId: 'ord-no-table-void-2',
  orderNumber: 241,
  tableNumber: null,
  isTakeaway: false,
};

describe('AdminVoidDialog Edge Cases Suite', () => {
  it('renders "Para llevar" in dialog title when tableNumber is null and isTakeaway is true', () => {
    render(
      <AdminVoidDialog
        order={TAKEAWAY_ORDER}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Para llevar · #240/)).toBeInTheDocument();
  });

  it('renders without table or takeaway tag when both tableNumber and isTakeaway are null/false', () => {
    render(
      <AdminVoidDialog
        order={NO_TABLE_ORDER}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Anulación Administrativa · #241/)).toBeInTheDocument();
  });

  it('renders "Merma pura asumida por el restaurante" banner when reason is non-chargeable', () => {
    render(
      <AdminVoidDialog
        order={TAKEAWAY_ORDER}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Click "Cortesía gerencial" (defaultCharge: false)
    const cortesiaBtn = screen.getByTestId('admin-void-reason-cortesía-gerencial');
    resetPointerActionForTest();
    fireEvent.click(cortesiaBtn);

    const warningBanner = screen.getByTestId('admin-void-warning');
    expect(warningBanner).toHaveTextContent(
      'Merma pura asumida por el restaurante (sin cobro al cliente)',
    );
  });

  it('handles virtual keyboard typing and backspace into custom reason input', () => {
    render(
      <AdminVoidDialog
        order={TAKEAWAY_ORDER}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Toggle custom reason on
    const toggleCustomBtn = screen.getByTestId('admin-void-toggle-custom-reason');
    resetPointerActionForTest();
    fireEvent.click(toggleCustomBtn);

    // Open virtual keyboard
    const toggleKeyboardBtn = screen.getByTestId('admin-void-toggle-keyboard');
    resetPointerActionForTest();
    fireEvent.click(toggleKeyboardBtn);

    const keyboard = screen.getByTestId('virtual-keyboard');
    expect(keyboard).toBeInTheDocument();

    // Type letters using virtual keyboard
    const keyA = screen.getByTestId('virtual-key-A');
    const keyB = screen.getByTestId('virtual-key-B');
    const keySpace = screen.getByTestId('virtual-key-space');
    const keyBackspace = screen.getByTestId('virtual-key-backspace');

    resetPointerActionForTest();
    fireEvent.click(keyA);
    resetPointerActionForTest();
    fireEvent.click(keyB);
    resetPointerActionForTest();
    fireEvent.click(keySpace);

    const input = screen.getByTestId('admin-void-custom-reason-input');
    expect(input).toHaveValue('AB ');

    // Press backspace
    resetPointerActionForTest();
    fireEvent.click(keyBackspace);
    expect(input).toHaveValue('AB');

    // Hide keyboard
    resetPointerActionForTest();
    fireEvent.click(toggleKeyboardBtn);
    expect(screen.queryByTestId('virtual-keyboard')).not.toBeInTheDocument();
  });

  it('marks opposite reasons as incompatible/contradictory and disables them', () => {
    render(
      <AdminVoidDialog
        order={TAKEAWAY_ORDER}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Select "Deserción del comensal" (charge = true)
    const desercionBtn = screen.getByTestId('admin-void-reason-deserción-del-comensal');
    resetPointerActionForTest();
    fireEvent.click(desercionBtn);

    // "Error de captura del mesero" (charge = false) should now be disabled and marked incompatible
    const errorBtn = screen.getByTestId('admin-void-reason-error-de-captura-del-mesero');
    expect(errorBtn).toBeDisabled();
    expect(errorBtn).toHaveTextContent('Incompatible');
  });
});

