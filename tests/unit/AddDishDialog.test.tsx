import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddDishDialog } from '../../src/features/order-ticket/AddDishDialog.tsx';

describe('AddDishDialog', () => {
  it('renders correctly and does not render when isOpen is false', () => {
    const { rerender } = render(
      <AddDishDialog isOpen={false} onClose={vi.fn()} onAdd={vi.fn()} />,
    );
    expect(screen.queryByTestId('add-dish-dialog')).not.toBeInTheDocument();

    rerender(<AddDishDialog isOpen onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByTestId('add-dish-dialog')).toBeInTheDocument();
    expect(screen.getByText('Agregar Platillo a la Comanda')).toBeInTheDocument();
  });

  it('renders dish name as locked and read-only without suggestion chips', () => {
    render(
      <AddDishDialog
        dish={{ dishId: 'dish-pastor-1', name: 'Tacos al Pastor', unitPrice: 85.0 }}
        onClose={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const nameInput = screen.getByTestId('add-dish-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Tacos al Pastor');
    expect(nameInput).toHaveAttribute('readonly');
    expect(nameInput).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('adjusts quantity with stepper buttons and input', () => {
    render(
      <AddDishDialog
        dish={{ name: 'Hamburguesa Clásica' }}
        onClose={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const qtyInput = screen.getByTestId('add-dish-quantity-input') as HTMLInputElement;
    expect(qtyInput.value).toBe('1');

    const incBtn = screen.getByLabelText('Aumentar cantidad');
    fireEvent.click(incBtn);
    expect(qtyInput.value).toBe('2');

    const decBtn = screen.getByLabelText('Disminuir cantidad');
    fireEvent.click(decBtn);
    expect(qtyInput.value).toBe('1');

    // Should not decrease below 1
    fireEvent.click(decBtn);
    expect(qtyInput.value).toBe('1');

    fireEvent.change(qtyInput, { target: { value: '5' } });
    expect(qtyInput.value).toBe('5');

    // Invalid input falls back to 1
    fireEvent.change(qtyInput, { target: { value: '0' } });
    expect(qtyInput.value).toBe('1');
  });

  it('submits valid dish data and calls onAdd and onClose', () => {
    const handleAdd = vi.fn();
    const handleClose = vi.fn();

    render(
      <AddDishDialog
        dish={{ dishId: 'dish-pastor-1', name: 'Tacos al Pastor', unitPrice: 85.0 }}
        onClose={handleClose}
        onAdd={handleAdd}
      />,
    );

    fireEvent.change(screen.getByTestId('add-dish-quantity-input'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByTestId('add-dish-modifiers-input'), {
      target: { value: 'Con todo, salsa verde' },
    });
    fireEvent.change(screen.getByTestId('add-dish-notes-input'), {
      target: { value: 'Cilantro aparte' },
    });

    fireEvent.click(screen.getByTestId('add-dish-submit-btn'));

    expect(handleAdd).toHaveBeenCalledWith({
      dishId: 'dish-pastor-1',
      itemId: undefined,
      name: 'Tacos al Pastor',
      quantity: 3,
      modifiers: ['Con todo', 'salsa verde'],
      notes: 'Cilantro aparte',
      unitPrice: 85.0,
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on cancel button click and escape key', () => {
    const handleClose = vi.fn();
    render(<AddDishDialog onClose={handleClose} onAdd={vi.fn()} />);

    fireEvent.click(screen.getByTestId('add-dish-cancel-btn'));
    expect(handleClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByTestId('add-dish-dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('disables controls when isPending is true', () => {
    render(<AddDishDialog isPending onClose={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByTestId('add-dish-quantity-input')).toBeDisabled();
    expect(screen.getByTestId('add-dish-modifiers-input')).toBeDisabled();
    expect(screen.getByTestId('add-dish-notes-input')).toBeDisabled();
    expect(screen.getByTestId('add-dish-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('add-dish-submit-btn')).toBeDisabled();
  });
});
