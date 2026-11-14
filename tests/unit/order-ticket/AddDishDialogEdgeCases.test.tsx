import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddDishDialog } from '../../../src/features/order-ticket/AddDishDialog.tsx';

describe('AddDishDialog Edge Cases & Keyboard/Backdrop Suite', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <AddDishDialog isOpen={false} onClose={vi.fn()} onAdd={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to default title "Platillo del Menú" when no dish or initialDishName is given', () => {
    render(<AddDishDialog onClose={vi.fn()} onAdd={vi.fn()} />);
    const nameInput = screen.getByTestId('add-dish-name-input');
    expect(nameInput).toHaveValue('Platillo del Menú');
  });

  it('handles Escape key to close only when not isPending', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <AddDishDialog isOpen={true} isPending={true} onClose={handleClose} onAdd={vi.fn()} />,
    );

    const dialog = screen.getByTestId('add-dish-dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();

    rerender(
      <AddDishDialog isOpen={true} isPending={false} onClose={handleClose} onAdd={vi.fn()} />,
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles backdrop click (mousedown on dialog element) to close only when not isPending', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <AddDishDialog isOpen={true} isPending={true} onClose={handleClose} onAdd={vi.fn()} />,
    );

    const dialog = screen.getByTestId('add-dish-dialog');
    // Click on dialog backdrop
    fireEvent.mouseDown(dialog, { target: dialog });
    expect(handleClose).not.toHaveBeenCalled();

    rerender(
      <AddDishDialog isOpen={true} isPending={false} onClose={handleClose} onAdd={vi.fn()} />,
    );
    fireEvent.mouseDown(dialog, { target: dialog });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles quantity input changes with invalid, NaN or non-positive values falling back to 1', () => {
    render(<AddDishDialog onClose={vi.fn()} onAdd={vi.fn()} />);

    const qtyInput = screen.getByTestId('add-dish-quantity-input');
    expect(qtyInput).toHaveValue(1);

    // Enter NaN / string
    fireEvent.change(qtyInput, { target: { value: 'not-a-number' } });
    expect(qtyInput).toHaveValue(1);

    // Enter negative or zero
    fireEvent.change(qtyInput, { target: { value: '0' } });
    expect(qtyInput).toHaveValue(1);

    // Enter valid number
    fireEvent.change(qtyInput, { target: { value: '4' } });
    expect(qtyInput).toHaveValue(4);
  });

  it('shows error if dish name is empty whitespace upon form submission', () => {
    const handleAdd = vi.fn();
    render(
      <AddDishDialog
        initialDishName="   "
        onClose={vi.fn()}
        onAdd={handleAdd}
      />,
    );

    const submitBtn = screen.getByTestId('add-dish-submit-btn');
    fireEvent.click(submitBtn);

    expect(screen.getByRole('alert')).toHaveTextContent('El nombre del platillo es obligatorio.');
    expect(handleAdd).not.toHaveBeenCalled();
  });

  it('displays "Agregando…" and disables action buttons when isPending is true', () => {
    render(
      <AddDishDialog
        isPending={true}
        onClose={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const submitBtn = screen.getByTestId('add-dish-submit-btn');
    const cancelBtn = screen.getByTestId('add-dish-cancel-btn');
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveTextContent('Agregando…');
    expect(cancelBtn).toBeDisabled();
  });
});

