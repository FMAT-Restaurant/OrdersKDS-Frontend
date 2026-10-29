import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/shared/api/queryClient.ts';
import type { UseOrderEventsOptions } from '../../src/shared/realtime/useOrderEvents.ts';
import { OrderStatus } from '../../src/shared/types/order.ts';
import { mockOrder2 } from '../mocks/fixtures/orderFixtures.ts';
import { server } from '../mocks/server.ts';
import OrderTicketWidget from '../../src/OrderTicketWidget.tsx';

const realtime = vi.hoisted(() => ({ useOrderEvents: vi.fn() }));

vi.mock('../../src/shared/realtime/useOrderEvents.ts', () => ({
  useOrderEvents: realtime.useOrderEvents,
}));

const order = {
  ...mockOrder2,
  status: OrderStatus.CREATED,
  items: [
    {
      ...mockOrder2.items[0],
      modifiers: ['Extra queso'],
      notes: 'Sin tomate',
    },
  ],
};

function renderTicket(onCreateNewOrder = vi.fn()) {
  return render(
    <OrderTicketWidget
      orderId={order.id ?? 'ord-102'}
      userId="waiter-7"
      tokenProvider={async () => 'test-token'}
      apiBaseUrl="http://localhost"
      webSocketBaseUrl="ws://localhost"
      onCreateNewOrder={onCreateNewOrder}
    />,
  );
}

describe('OrderTicketWidget', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    queryClient.clear();
    realtime.useOrderEvents.mockReturnValue({ status: 'CONNECTED' });
    server.use(
      http.get('*/orders/:orderId', () => HttpResponse.json(order)),
    );
  });

  it('renders the order, item details, and waiter realtime channels', async () => {
    renderTicket();

    expect(await screen.findByRole('heading', { name: 'Comanda ord-102' })).toBeInTheDocument();
    expect(screen.getByText('1 × Ensalada César')).toBeInTheDocument();
    expect(screen.getByText('Modificadores: Extra queso')).toBeInTheDocument();
    expect(screen.getByText('Nota: Sin tomate')).toBeInTheDocument();

    expect(realtime.useOrderEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'waiter',
        channels: ['floor', 'user:waiter-7'],
        baseUrl: 'ws://localhost',
      }),
    );
  });

  it('renders a table ticket and optional item fields with editable defaults', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          isTakeaway: false,
          tableNumber: 12,
          items: [
            {
              ...order.items[0],
              modifiers: undefined,
              notes: null,
              status: 'READY',
            },
          ],
        }),
      ),
    );
    renderTicket();

    expect(await screen.findByText('Mesa 12')).toBeInTheDocument();
    expect(screen.getByText('Listo')).toBeInTheDocument();
    expect(screen.queryByText(/Modificadores:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nota:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Modificar' }));
    expect(screen.getByLabelText('Modificadores de Ensalada César')).toHaveValue('');
    expect(screen.getByLabelText('Notas de Ensalada César')).toHaveValue('');
  });

  it('shows an empty ticket and its table fallback', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          id: undefined,
          orderId: undefined,
          publicId: undefined,
          isTakeaway: false,
          tableNumber: null,
          status: OrderStatus.IN_PREPARATION,
          items: [],
        }),
      ),
    );
    renderTicket();

    expect(await screen.findByRole('heading', { name: 'Comanda ord-102' })).toBeInTheDocument();
    expect(screen.getByText('Mesa sin asignar')).toBeInTheDocument();
    expect(screen.getByText('Esta comanda todavía no tiene platillos.')).toBeInTheDocument();
    expect(screen.getByText('En preparación')).toBeInTheDocument();
  });

  it('edits quantities, modifiers, and notes before confirmation', async () => {
    let updatedItems: unknown;
    server.use(
      http.patch('*/orders/:orderId/items', async ({ request }) => {
        updatedItems = await request.json();
        return HttpResponse.json({
          ...order,
          items: [{ ...order.items[0], quantity: 3, modifiers: ['Extra queso', 'Aguacate'] }],
        });
      }),
    );
    renderTicket();

    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
    fireEvent.change(screen.getByLabelText('Cantidad de Ensalada César'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Modificadores de Ensalada César'), {
      target: { value: 'Extra queso, Aguacate' },
    });
    fireEvent.change(screen.getByLabelText('Notas de Ensalada César'), {
      target: { value: 'Sin tomate y sin cebolla' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updatedItems).toEqual({
        items: [
          {
            id: 'item-3',
            itemId: 'item-3',
            dishId: undefined,
            name: 'Ensalada César',
            quantity: 3,
            modifiers: ['Extra queso', 'Aguacate'],
            notes: 'Sin tomate y sin cebolla',
          },
        ],
      });
    });
    expect(await screen.findByText('3 × Ensalada César')).toBeInTheDocument();
  });

  it('blocks saving an invalid quantity', async () => {
    let updateRequests = 0;
    server.use(
      http.patch('*/orders/:orderId/items', () => {
        updateRequests += 1;
        return HttpResponse.json(order);
      }),
    );
    renderTicket();

    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
    fireEvent.change(screen.getByLabelText('Cantidad de Ensalada César'), {
      target: { value: '0' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La cantidad de cada platillo debe ser un entero mayor que cero.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(updateRequests).toBe(0);
  });

  it('shows stock confirmation after confirm and blocks repeated clicks', async () => {
    let confirmRequests = 0;
    server.use(
      http.post('*/orders/:orderId/confirm', async () => {
        confirmRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({
          ...order,
          confirmedAt: '2026-10-29T19:00:00Z',
        });
      }),
    );
    renderTicket();

    const confirmButton = await screen.findByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(await screen.findByText('Pendiente de confirmación de stock')).toBeInTheDocument();
    expect(confirmRequests).toBe(1);
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
  });

  it('allows cancellation when confirmed but keeps modification and confirmation disabled', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          confirmedAt: '2026-10-29T19:00:00Z',
          awaitingStockConfirmation: true,
        }),
      ),
      http.patch('*/orders/:orderId/cancel', () =>
        HttpResponse.json({ ...order, status: OrderStatus.CANCELLED }),
      ),
    );
    renderTicket();

    expect(await screen.findByText('Pendiente de confirmación de stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it.each([
    [OrderStatus.REJECTED, 'La comanda fue rechazada. Crea una nueva comanda.'],
    [OrderStatus.EXPIRED, 'La comanda expiró. Crea una nueva comanda.'],
    [OrderStatus.DELIVERED, 'Entregada por cocina — recoger.'],
  ] as const)('announces %s and offers a new order action when applicable', async (status, message) => {
    const createOrder = vi.fn();
    server.use(
      http.get('*/orders/:orderId', () => HttpResponse.json({ ...order, status })),
    );
    renderTicket(createOrder);

    const alert = await screen.findByText(message);
    expect(alert).toBeInTheDocument();
    expect(alert.closest('[aria-live="assertive"]')).toBeInTheDocument();
    const newOrderButton = screen.queryByRole('button', { name: 'Crear una nueva comanda' });
    if (status === OrderStatus.DELIVERED) {
      expect(newOrderButton).not.toBeInTheDocument();
      return;
    }

    expect(newOrderButton).toBeInTheDocument();
    if (!newOrderButton) {
      return;
    }
    fireEvent.click(newOrderButton);
    expect(createOrder).toHaveBeenCalledOnce();
  });

  it('applies a newer waiter status event to the displayed order', async () => {
    renderTicket();

    await screen.findByRole('heading', { name: 'Comanda ord-102' });
    const options = realtime.useOrderEvents.mock.calls[0][0] as UseOrderEventsOptions;
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'ord-102',
      status: OrderStatus.DELIVERED,
      version: order.version + 1,
    });

    expect(await screen.findByText('Entregada por cocina — recoger.')).toBeInTheDocument();
  });

  it('reports API errors safely and lets the user retry loading', async () => {
    let requests = 0;
    server.use(
      http.get('*/orders/:orderId', () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'VERSION_CONFLICT',
                message: 'Sensitive backend detail',
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(order);
      }),
    );
    renderTicket();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La comanda fue actualizada por otro usuario. Se han recargado los datos más recientes.',
    );
    expect(screen.queryByText('Sensitive backend detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Comanda ord-102' })).toBeInTheDocument();
  });
});
