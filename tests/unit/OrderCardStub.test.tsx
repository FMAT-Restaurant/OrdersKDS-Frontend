import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { OrderCardStub } from '../../src/features/kds-board/OrderCardStub.tsx';
import type { Order } from '../../src/shared/api/schemas.ts';
import { OrderStatus } from '../../src/shared/types/order.ts';

describe('OrderCardStub Component Suite', () => {
  const baseOrder: Order = {
    id: 'ord-1234',
    tableNumber: 5,
    isTakeaway: false,
    orderNumber: 42,
    status: OrderStatus.IN_PREPARATION,
    version: 1,
    items: [],
  };

  it('renders order number, table number, and status correctly', () => {
    render(<OrderCardStub order={baseOrder} isFocused={false} />);

    expect(screen.getByTestId('order-id-ord-1234')).toHaveTextContent('#42');
    expect(screen.getByTestId('order-table-ord-1234')).toHaveTextContent('Mesa 5');
    expect(screen.getByTestId('order-status-ord-1234')).toHaveTextContent(OrderStatus.IN_PREPARATION);
  });

  it('renders UUID display correctly when orderNumber is omitted', () => {
    const uuidOrder: Order = {
      ...baseOrder,
      id: '12345678-1234-1234-1234-123456789abc',
      orderNumber: undefined,
      tableNumber: null,
    };

    render(<OrderCardStub order={uuidOrder} />);

    expect(screen.getByTestId('order-id-12345678-1234-1234-1234-123456789abc')).toHaveTextContent('#9ABC');
    expect(screen.queryByTestId('order-table-12345678-1234-1234-1234-123456789abc')).not.toBeInTheDocument();
  });

  it('renders cleaned string when id is non-uuid string with ord- prefix', () => {
    const customOrder: Order = {
      ...baseOrder,
      id: 'ord-special-99',
      orderNumber: undefined,
      tableNumber: undefined,
    };

    render(<OrderCardStub order={customOrder} />);

    expect(screen.getByTestId('order-id-ord-special-99')).toHaveTextContent('#special-99');
  });

  it('falls back to orderId or publicId when id is missing', () => {
    const fallbackOrder = {
      orderId: 'ord-fallback-1',
      status: OrderStatus.CREATED,
      version: 1,
      items: [],
    } as unknown as Order;

    render(<OrderCardStub order={fallbackOrder} />);

    expect(screen.getByTestId('order-id-ord-fallback-1')).toHaveTextContent('#fallback-1');
  });

  it('handles click callback when clicked', () => {
    const onClick = vi.fn();
    render(<OrderCardStub order={baseOrder} onClick={onClick} />);

    fireEvent.click(screen.getByTestId('order-card-stub-ord-1234'));
    expect(onClick).toHaveBeenCalledWith(baseOrder);
  });

  it('handles keyboard navigation with Enter and Space keys', () => {
    const onClick = vi.fn();
    render(<OrderCardStub order={baseOrder} onClick={onClick} />);

    const button = screen.getByTestId('order-card-stub-ord-1234');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);

    // Other keys do not trigger onClick
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not crash when clicked without onClick callback', () => {
    render(<OrderCardStub order={baseOrder} />);

    const button = screen.getByTestId('order-card-stub-ord-1234');
    expect(() => fireEvent.click(button)).not.toThrow();
    expect(() => fireEvent.keyDown(button, { key: 'Enter' })).not.toThrow();
  });

  it('applies focused styles when isFocused is true', () => {
    render(<OrderCardStub order={baseOrder} isFocused={true} />);

    const button = screen.getByTestId('order-card-stub-ord-1234');
    expect(button).toHaveClass('ring-2');
  });
});
