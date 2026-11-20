import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ConfirmReadyDialog } from '../../src/features/kds-board/dialogs/ConfirmReadyDialog.tsx';
import {
  pointerAction,
  resetPointerActionForTest,
} from '../../src/features/kds-board/pointerAction.ts';
import type { Order } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';

describe('ConfirmReadyDialog (User Requirement 3)', () => {
  afterEach(() => {
    resetPointerActionForTest();
  });
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

  it('ignores non-Escape keydown events and handles orders without table or takeaway', () => {
    const onKeepInPrep = vi.fn();
    const generalOrder: Order = {
      ...mockOrder,
      id: undefined,
      publicId: 'pub-9999',
      tableNumber: null,
      isTakeaway: false,
      orderNumber: 50,
    };

    render(
      <ConfirmReadyDialog
        order={generalOrder}
        item={mockItem}
        isOpen={true}
        onConfirm={vi.fn()}
        onKeepInPrep={onKeepInPrep}
      />,
    );

    // Header displays Comanda #50 without table prefix
    expect(screen.getByText('Comanda #50')).toBeInTheDocument();

    // Non-Escape key does not trigger onKeepInPrep
    fireEvent.keyDown(screen.getByTestId('confirm-ready-dialog'), { key: 'Enter' });
    expect(onKeepInPrep).not.toHaveBeenCalled();
  });

  it('focuses keep-prep button by default and blocks ghost click immediately after upstream pointerUp', () => {
    const onConfirm = vi.fn();
    const onKeepInPrep = vi.fn();
    const upstreamTrigger = pointerAction(vi.fn());

    render(
      <>
        <button type="button" data-testid="upstream-ready-btn" {...upstreamTrigger}>
          Ready
        </button>
        <ConfirmReadyDialog
          order={mockOrder}
          item={mockItem}
          isOpen={true}
          onConfirm={onConfirm}
          onKeepInPrep={onKeepInPrep}
        />
      </>,
    );

    expect(screen.getByTestId('confirm-ready-keep-prep-btn')).toHaveFocus();
    expect(screen.getByTestId('confirm-ready-submit-btn')).not.toHaveFocus();

    // Simulate pointerUp opening the dialog followed immediately by a trailing browser ghost click
    fireEvent.pointerUp(screen.getByTestId('upstream-ready-btn'), { button: 0, pointerType: 'mouse' });
    fireEvent.click(screen.getByTestId('confirm-ready-submit-btn'));
    expect(onConfirm).not.toHaveBeenCalled();

    // Explicit intentional pointerUp on confirm button does submit
    fireEvent.pointerUp(screen.getByTestId('confirm-ready-submit-btn'), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onKeepInPrep).not.toHaveBeenCalled();
  });

  it('ignores pointerUp actions on both buttons while isSubmitting is true', () => {
    const onConfirm = vi.fn();
    const onKeepInPrep = vi.fn();

    render(
      <ConfirmReadyDialog
        order={mockOrder}
        item={mockItem}
        isOpen={true}
        isSubmitting={true}
        onConfirm={onConfirm}
        onKeepInPrep={onKeepInPrep}
      />,
    );

    fireEvent.pointerUp(screen.getByTestId('confirm-ready-submit-btn'), {
      button: 0,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(screen.getByTestId('confirm-ready-keep-prep-btn'), {
      button: 0,
      pointerType: 'mouse',
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onKeepInPrep).not.toHaveBeenCalled();
  });
});
