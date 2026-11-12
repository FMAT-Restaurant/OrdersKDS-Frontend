import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../src/shared/api/queryClient.ts';
import { OrderStatus } from '../../../src/shared/types/order.ts';
import { server } from '../../mocks/server.ts';
import OrderTicketWidget from '../../../src/OrderTicketWidget.tsx';

const realtime = vi.hoisted(() => ({ useOrderEvents: vi.fn() }));

vi.mock('../../../src/shared/realtime/useOrderEvents.ts', () => ({
  useOrderEvents: realtime.useOrderEvents,
}));

describe('OrderTicketWidget Creation and Event Bus Suite', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    queryClient.clear();
    realtime.useOrderEvents.mockReturnValue({ status: 'CONNECTED' });
  });

  it('renders in standalone draft mode without orderId and adds dishes via UI button and AddDishDialog', async () => {
    render(
      <OrderTicketWidget
        tableNumber={5}
        diningSessionId="ses-test-123"
        userId="waiter-1"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    // Draft header rendered
    expect(screen.getByText('Nueva Comanda')).toBeInTheDocument();
    expect(screen.getByTestId('draft-table-input')).toHaveValue(5);
    expect(screen.getByText(/Borrador/)).toBeInTheDocument();

    // Empty state
    expect(screen.getByText('Esta comanda todavía no tiene platillos.')).toBeInTheDocument();

    // Click "+ Agregar platillo"
    const addDishBtn = screen.getByTestId('order-ticket-add-dish-btn');
    fireEvent.click(addDishBtn);

    // AddDishDialog should open
    expect(screen.getByTestId('add-dish-dialog')).toBeInTheDocument();
    const qtyInput = screen.getByTestId('add-dish-quantity-input');
    fireEvent.change(qtyInput, { target: { value: '2' } });

    const notesInput = screen.getByTestId('add-dish-notes-input');
    fireEvent.change(notesInput, { target: { value: 'Poco picante' } });

    // Submit dialog
    const submitDialogBtn = screen.getByTestId('add-dish-submit-btn');
    fireEvent.click(submitDialogBtn);

    // Dialog closes and item appears in draft list
    expect(screen.queryByTestId('add-dish-dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Platillo del Menú')).toBeInTheDocument();
  });

  it('responds to fmat:comanda:open-add-dialog and fmat:comanda:add-item window events', async () => {
    render(
      <OrderTicketWidget
        tableNumber={8}
        diningSessionId="ses-456"
        userId="waiter-2"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    // 1. Dispatch fmat:comanda:open-add-dialog
    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:open-add-dialog', {
          detail: {
            dishId: 'dish-mfe-1',
            name: 'Cochinita Pibil',
            unitPrice: 160,
          },
        }),
      );
    });

    // Dialog opens with dish preloaded
    const nameInput = await screen.findByTestId('add-dish-name-input');
    expect(nameInput).toHaveValue('Cochinita Pibil');

    // Confirm dialog
    fireEvent.click(screen.getByTestId('add-dish-submit-btn'));
    expect(await screen.findByText('Cochinita Pibil')).toBeInTheDocument();

    // 2. Dispatch fmat:comanda:add-item directly
    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:add-item', {
          detail: {
            dishId: 'dish-mfe-2',
            name: 'Agua de Chaya',
            quantity: 2,
            unitPrice: 40,
            modifiers: ['Con limón'],
            notes: 'Bien fría',
          },
        }),
      );
    });

    expect(await screen.findByText('Agua de Chaya')).toBeInTheDocument();
  });

  it('creates order and sends to kitchen when Enviar a Cocina is pressed', async () => {
    let orderCreated = false;
    let itemsPatched = false;
    let orderConfirmed = false;

    server.use(
      http.post('*/orders', async () => {
        orderCreated = true;
        return HttpResponse.json({
          id: 'ord-created-99',
          orderId: 'ord-created-99',
          orderNumber: 205,
          status: OrderStatus.CREATED,
          version: 1,
          tableNumber: 3,
          isTakeaway: false,
          totalAmount: 120,
          createdAt: '2026-11-12T00:00:00Z',
          items: [],
        });
      }),
      http.patch('*/orders/ord-created-99/items', async () => {
        itemsPatched = true;
        return HttpResponse.json({
          id: 'ord-created-99',
          orderId: 'ord-created-99',
          orderNumber: 205,
          status: OrderStatus.CREATED,
          version: 2,
          tableNumber: 3,
          isTakeaway: false,
          totalAmount: 120,
          createdAt: '2026-11-12T00:00:00Z',
          items: [
            {
              id: 'it-1',
              itemId: 'it-1',
              dishId: 'dish-1',
              name: 'Tacos de Pastor',
              quantity: 2,
              unitPrice: 60,
              status: 'PENDING',
              station: 'trompo',
              modifiers: [],
              notes: '',
            },
          ],
        });
      }),
      http.post('*/orders/ord-created-99/confirm', async () => {
        orderConfirmed = true;
        return HttpResponse.json({
          id: 'ord-created-99',
          orderId: 'ord-created-99',
          orderNumber: 205,
          status: OrderStatus.CREATED,
          version: 3,
          tableNumber: 3,
          isTakeaway: false,
          totalAmount: 120,
          createdAt: '2026-11-12T00:00:00Z',
          items: [],
        });
      }),
    );

    const handleSubmitted = vi.fn();

    render(
      <OrderTicketWidget
        tableNumber={3}
        userId="waiter-3"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        onOrderSubmitted={handleSubmitted}
      />,
    );

    // Add item directly via event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:add-item', {
          detail: {
            dishId: 'dish-1',
            name: 'Tacos de Pastor',
            quantity: 2,
            unitPrice: 60,
          },
        }),
      );
    });

    const sendBtn = await screen.findByTestId('order-ticket-create-confirm-btn');
    expect(sendBtn).toBeEnabled();

    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(orderCreated).toBe(true);
      expect(itemsPatched).toBe(true);
      expect(orderConfirmed).toBe(true);
      expect(handleSubmitted).toHaveBeenCalledWith('ord-created-99');
    });
  });

  it('saves draft and calls onOrderCreated without confirm when Guardar borrador is pressed', async () => {
    let orderCreated = false;
    let itemsPatched = false;

    server.use(
      http.post('*/orders', async () => {
        orderCreated = true;
        return HttpResponse.json({
          id: 'ord-draft-only-77',
          orderId: 'ord-draft-only-77',
          orderNumber: 206,
          status: OrderStatus.CREATED,
          version: 1,
          tableNumber: 2,
          isTakeaway: false,
          totalAmount: 50,
          createdAt: '2026-11-12T00:00:00Z',
          items: [],
        });
      }),
      http.patch('*/orders/ord-draft-only-77/items', async () => {
        itemsPatched = true;
        return HttpResponse.json({
          id: 'ord-draft-only-77',
          orderId: 'ord-draft-only-77',
          orderNumber: 206,
          status: OrderStatus.CREATED,
          version: 2,
          tableNumber: 2,
          isTakeaway: false,
          totalAmount: 25,
          createdAt: '2026-11-12T00:00:00Z',
          items: [],
        });
      }),
    );

    const handleCreated = vi.fn();

    render(
      <OrderTicketWidget
        tableNumber={2}
        userId="waiter-4"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        onOrderCreated={handleCreated}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:add-item', {
          detail: {
            name: 'Agua Natural',
            quantity: 1,
            unitPrice: 25,
          },
        }),
      );
    });

    const saveDraftBtn = await screen.findByTestId('order-ticket-create-draft-btn');
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      expect(orderCreated).toBe(true);
      expect(itemsPatched).toBe(true);
      expect(handleCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ord-draft-only-77' }),
      );
    });
  });

  it('displays error banner if POST /orders fails during creation', async () => {
    server.use(
      http.post('*/orders', async () => {
        return HttpResponse.json(
          { message: 'Mesa no disponible o con comanda activa' },
          { status: 400 },
        );
      }),
    );

    render(
      <OrderTicketWidget
        tableNumber={2}
        userId="waiter-5"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:add-item', {
          detail: {
            name: 'Tacos',
            quantity: 1,
          },
        }),
      );
    });

    const sendBtn = await screen.findByTestId('order-ticket-create-confirm-btn');
    fireEvent.click(sendBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('discards draft items when Descartar borrador is pressed', async () => {
    render(
      <OrderTicketWidget
        tableNumber={1}
        userId="waiter-6"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('fmat:comanda:add-item', {
          detail: {
            name: 'Item a descartar',
            quantity: 1,
          },
        }),
      );
    });

    expect(await screen.findByText('Item a descartar')).toBeInTheDocument();

    const discardBtn = screen.getByTestId('order-ticket-discard-btn');
    fireEvent.click(discardBtn);

    expect(screen.queryByText('Item a descartar')).not.toBeInTheDocument();
    expect(screen.getByText('Esta comanda todavía no tiene platillos.')).toBeInTheDocument();
  });
});

