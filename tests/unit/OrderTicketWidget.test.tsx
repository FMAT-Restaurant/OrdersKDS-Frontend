import '@testing-library/jest-dom/vitest';
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

function renderTicket(onCreateNewOrder = vi.fn(), diningSessionId?: string) {
  return render(
    <OrderTicketWidget
      orderId={order.id ?? 'ord-102'}
      userId="waiter-7"
      tokenProvider={async () => 'test-token'}
      apiBaseUrl="http://localhost"
      webSocketBaseUrl="ws://localhost"
      diningSessionId={diningSessionId}
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

  it('renders a table ticket, optional item fields with editable defaults, and dining session', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          isTakeaway: false,
          tableNumber: 12,
          diningSessionId: 'session-12345678',
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

    expect(await screen.findByText(/Mesa 12/)).toBeInTheDocument();
    expect(screen.getByText(/Sesión session-/)).toBeInTheDocument();
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

  it('edits quantities, modifiers, and notes before confirmation and can remove items', async () => {
    let updatedItems: unknown;
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          items: [
            { ...order.items[0], id: 'item-1', name: 'Ensalada César' },
            { ...order.items[0], id: 'item-2', name: 'Sopa del día' },
          ],
        }),
      ),
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
    expect(screen.getAllByRole('button', { name: 'Quitar platillo' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar platillo' })[1]);

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
            id: 'item-1',
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
      'La cantidad de cada platillo debe ser un entero mayor que cero',
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

  it('allows cancellation when confirmed in CREATED status (DoD)', async () => {
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
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it('allows cancellation in RESERVED status (DoD)', async () => {
    let cancelCalled = false;
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.RESERVED,
          stockReservedAt: '2026-10-31T10:00:00Z',
        }),
      ),
      http.patch('*/orders/:orderId/cancel', () => {
        cancelCalled = true;
        return HttpResponse.json({ ...order, status: OrderStatus.CANCELLED });
      }),
    );
    renderTicket();

    expect(await screen.findByText('Reservado en cocina')).toBeInTheDocument();
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();

    fireEvent.click(cancelButton);
    await waitFor(() => expect(cancelCalled).toBe(true));
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it('allows cancellation in REJECTED status (DoD)', async () => {
    let cancelCalled = false;
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
        }),
      ),
      http.patch('*/orders/:orderId/cancel', () => {
        cancelCalled = true;
        return HttpResponse.json({ ...order, status: OrderStatus.CANCELLED });
      }),
    );
    renderTicket();

    expect(await screen.findByText('Rechazada')).toBeInTheDocument();
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelButton).toBeEnabled();

    fireEvent.click(cancelButton);
    await waitFor(() => expect(cancelCalled).toBe(true));
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it('blocks cancellation and modification in IN_PREPARATION status (DoD)', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.IN_PREPARATION,
          inPreparationAt: '2026-10-31T10:05:00Z',
        }),
      ),
    );
    renderTicket();

    expect(await screen.findByText('En preparación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
  });

  it('allows modifying order in REJECTED status and reopens to CREATED as draft (DoD / ADR-0016)', async () => {
    let itemsUpdated = false;
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
          items: [
            {
              ...order.items[0],
              dishId: 'dish-salad',
              quantity: 2,
            },
          ],
        }),
      ),
      http.patch('*/orders/:orderId/items', async () => {
        itemsUpdated = true;
        // Backend executes order.reopen_as_draft() -> status CREATED, confirmedAt null
        return HttpResponse.json({
          ...order,
          status: OrderStatus.CREATED,
          confirmedAt: null,
          rejectionDetails: null,
          items: [
            {
              ...order.items[0],
              dishId: 'dish-salad',
              quantity: 1,
            },
          ],
        });
      }),
    );
    renderTicket();

    expect(await screen.findByText('Rechazada')).toBeInTheDocument();
    const modifyButton = screen.getByRole('button', { name: 'Modificar' });
    expect(modifyButton).toBeEnabled();

    fireEvent.click(modifyButton);
    expect(screen.getByLabelText('Cantidad de Ensalada César')).toHaveValue(2);
    fireEvent.change(screen.getByLabelText('Cantidad de Ensalada César'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(itemsUpdated).toBe(true));

    // After reopen, order is back in CREATED draft state: Confirmar is now enabled
    expect(await screen.findByText('Creada')).toBeInTheDocument();
    expect(screen.getByText('1 × Ensalada César')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('displays visual breakdown of rejectionDetails and announces in aria-live (DoD)', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
          rejectionDetails: {
            missingIngredients: ['Queso Parmesano', 'Crutones'],
            rejectedItems: [
              {
                dishId: 'dish-salad',
                name: 'Ensalada César',
                requestedQuantity: 3,
                availableQuantity: 1,
              },
            ],
            reservedItems: [
              {
                dishId: 'dish-soup',
                name: 'Sopa de Tomate',
                quantity: 2,
              },
            ],
          },
        }),
      ),
    );
    renderTicket();

    expect(await screen.findByText('Detalle de rechazo de stock')).toBeInTheDocument();
    expect(screen.getAllByText(/Queso Parmesano, Crutones/)).toHaveLength(2);
    expect(screen.getAllByText(/solicitados: 3, disponibles: 1/i)).toHaveLength(2);
    expect(screen.getByText('Sopa de Tomate')).toBeInTheDocument();
    expect(screen.getByText(/: 2 apartados temporalmente/)).toBeInTheDocument();

    const alertLive = document.querySelector('.order-ticket__alert[aria-live="assertive"]');
    expect(alertLive).toBeInTheDocument();
    expect(alertLive).toHaveTextContent('Ensalada César (solicitados: 3, disponibles: 1)');
    expect(alertLive).toHaveTextContent('Queso Parmesano, Crutones');
  });

  it('renders badge Reservado en cocina for RESERVED status (DoD)', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.RESERVED,
        }),
      ),
    );
    renderTicket();

    const badge = await screen.findByText('Reservado en cocina');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', 'RESERVED');
  });

  it('announces EXPIRED with action to create a new order (DoD)', async () => {
    const createOrder = vi.fn();
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.EXPIRED,
        }),
      ),
    );
    renderTicket(createOrder);

    const alert = await screen.findByText('La comanda expiró. Crea una nueva comanda.');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('[aria-live="assertive"]')).toBeInTheDocument();
    const newOrderButton = screen.getByRole('button', { name: 'Crear una nueva comanda' });
    expect(newOrderButton).toBeInTheDocument();
    fireEvent.click(newOrderButton);
    expect(createOrder).toHaveBeenCalledOnce();
  });

  it('announces DELIVERED without new order button (DoD)', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.DELIVERED,
        }),
      ),
    );
    renderTicket();

    const alert = await screen.findByText('Entregada por cocina — recoger.');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('[aria-live="assertive"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear una nueva comanda' })).not.toBeInTheDocument();
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
