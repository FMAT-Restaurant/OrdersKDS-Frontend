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

    expect(await screen.findByRole('heading', { name: 'Comanda #102' })).toBeInTheDocument();
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
    expect(screen.getByText(/Sesión #12345678/)).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Comanda #102' })).toBeInTheDocument();
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

    expect(await screen.findByText('Pendiente de confirmación de inventario')).toBeInTheDocument();
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

    expect(await screen.findByText('Pendiente de confirmación de inventario')).toBeInTheDocument();
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

    expect(await screen.findByText('Detalle de rechazo de inventario')).toBeInTheDocument();
    expect(screen.getByText(/Queso Parmesano, Crutones/)).toBeInTheDocument();
    expect(screen.getByText(/solicitados: 3, disponibles: 1/i)).toBeInTheDocument();
    expect(screen.getByText('Sopa de Tomate')).toBeInTheDocument();
    expect(screen.getByText(/: 2 apartados temporalmente/)).toBeInTheDocument();

    const alertLive = document.querySelector('.order-ticket__alert[aria-live="assertive"]');
    expect(alertLive).toBeInTheDocument();
    expect(alertLive).toHaveTextContent('Motivo de rechazo: Inventario insuficiente.');
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

  it('requires a nonblank reason and submits delivered-item redo without changing order status', async () => {
    const deliveredOrder = {
      ...order,
      status: OrderStatus.DELIVERED,
      items: order.items.map((item) => ({ ...item, status: 'DELIVERED' as const })),
    };
    const redoneOrder = {
      ...deliveredOrder,
      items: deliveredOrder.items.map((item) => ({ ...item, status: 'PENDING' as const })),
    };
    let submittedBody: unknown;

    server.use(
      http.get('*/orders/:orderId', () => HttpResponse.json(deliveredOrder)),
      http.patch('*/orders/:orderId/items/:itemId/redo', async ({ request, params }) => {
        expect(params.orderId).toBe('ord-102');
        expect(params.itemId).toBe('item-3');
        submittedBody = await request.json();
        return HttpResponse.json(redoneOrder);
      }),
    );
    queryClient.setQueryData(['kds', 'queue', 'delivered'], [deliveredOrder]);
    renderTicket();

    fireEvent.click(await screen.findByRole('button', { name: 'Rehacer Ensalada César' }));
    expect(screen.getByRole('dialog', { name: 'Rehacer platillo' })).toBeInTheDocument();

    const noteInput = screen.getByRole('textbox', { name: /Motivo/ });
    const submitButton = screen.getByRole('button', { name: 'Rehacer' });
    expect(submitButton).toBeDisabled();
    fireEvent.change(noteInput, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(noteInput, { target: { value: 'Llegó frío' } });
    expect(submitButton).toBeEnabled();
    fireEvent.click(submitButton);

    await waitFor(() => expect(submittedBody).toEqual({ note: 'Llegó frío' }));
    expect(await screen.findByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Entregada por cocina')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const cachedDeliveredOrder = queryClient.getQueryData<Array<typeof deliveredOrder>>([
      'kds',
      'queue',
      'delivered',
    ])?.[0];
    expect(cachedDeliveredOrder?.status).toBe(OrderStatus.DELIVERED);
    expect(cachedDeliveredOrder?.items[0].status).toBe('PENDING');
  });

  it('applies a newer waiter status event to the displayed order', async () => {
    renderTicket();

    await screen.findByRole('heading', { name: 'Comanda #102' });
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

    expect(await screen.findByRole('heading', { name: 'Comanda #102' })).toBeInTheDocument();
  });

  it('discards edits and reverts to view mode when user clicks Descartar', async () => {
    renderTicket();
    const modifyBtn = await screen.findByRole('button', { name: 'Modificar' });
    fireEvent.click(modifyBtn);
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notas de Ensalada César'), {
      target: { value: 'Modificación temporal no guardada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeInTheDocument();
    expect(screen.getByText('Nota: Sin tomate')).toBeInTheDocument();
  });

  it('displays error banner when confirmMutation or cancelMutation fails', async () => {
    server.use(
      http.post('*/orders/:orderId/confirm', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_STATE_TRANSITION', message: 'Fail' } },
          { status: 409 },
        ),
      ),
      http.patch('*/orders/:orderId/cancel', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Fail' } },
          { status: 500 },
        ),
      ),
    );
    renderTicket();
    const confirmButton = await screen.findByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmButton);
    expect(
      await screen.findByText('La comanda no puede cambiar al estado solicitado en este momento.'),
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelButton);
    expect(
      await screen.findByText('Ocurrió un error inesperado en el servidor. Por favor intente más tarde.'),
    ).toBeInTheDocument();
  });

  it('displays error banner when editMutation fails', async () => {
    server.use(
      http.patch('*/orders/:orderId/items', () =>
        HttpResponse.json(
          { error: { code: 'DISH_UNAVAILABLE', message: 'Fail' } },
          { status: 422 },
        ),
      ),
    );
    renderTicket();
    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('El platillo seleccionado ya no se encuentra disponible.'),
    ).toBeInTheDocument();
  });

  it('displays session expired alert on 401 and allows retry', async () => {
    let requests = 0;
    server.use(
      http.get('*/orders/:orderId', () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json(
            { error: { code: 'UNAUTHENTICATED', message: 'Auth failed' } },
            { status: 401 },
          );
        }
        return HttpResponse.json(order);
      }),
    );
    renderTicket();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Su sesión ha expirado o no es válida. Por favor inicie sesión nuevamente.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Comanda #102' })).toBeInTheDocument();
  });

  it('ignores WebSocket events for a different orderId or older/equal version', async () => {
    renderTicket();
    await screen.findByRole('heading', { name: 'Comanda #102' });
    const options = realtime.useOrderEvents.mock.calls[0][0] as UseOrderEventsOptions;

    // Different orderId -> ignored
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'other-order-999',
      status: OrderStatus.CANCELLED,
      version: order.version + 10,
    });
    expect(screen.queryByText('Cancelada')).not.toBeInTheDocument();

    // Older version -> ignored
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'ord-102',
      status: OrderStatus.CANCELLED,
      version: order.version - 1,
    });
    expect(screen.queryByText('Cancelada')).not.toBeInTheDocument();

    // Equal version -> ignored
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'ord-102',
      status: OrderStatus.CANCELLED,
      version: order.version,
    });
    expect(screen.queryByText('Cancelada')).not.toBeInTheDocument();
  });

  it('handles WebSocket events with rejectionDetails and preserving awaitingStockConfirmation in CREATED', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          awaitingStockConfirmation: true,
        }),
      ),
    );
    renderTicket();
    await screen.findByText('Pendiente de confirmación de inventario');
    const options = realtime.useOrderEvents.mock.calls[0][0] as UseOrderEventsOptions;

    // Event updating version while still in CREATED preserves awaitingStockConfirmation
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'ord-102',
      status: OrderStatus.CREATED,
      version: order.version + 1,
    });
    expect(await screen.findByText('Pendiente de confirmación de inventario')).toBeInTheDocument();

    // Then transition to REJECTED with rejectionDetails
    options.onOrderStatusChanged?.({
      type: 'order.status_changed',
      orderId: 'ord-102',
      status: OrderStatus.REJECTED,
      version: order.version + 2,
      rejectionDetails: {
        source: 'kitchen',
        faltantes: ['Lechuga'],
        rejectedItems: [{ itemId: 'item-1', reason: 'Agotado' }, { name: 'Torta' }],
        reservedItems: [{ offerId: 'unknown', reservedQuantity: 1 }],
      },
    });
    expect(await screen.findByText('Lechuga')).toBeInTheDocument();
    expect(screen.getByText('Torta')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente de confirmación de inventario')).not.toBeInTheDocument();
  });

  it('renders connection status messages for various websocket states', async () => {
    realtime.useOrderEvents.mockReturnValue({ status: 'CONNECTING' });
    const { unmount: unmount1 } = renderTicket();
    expect(await screen.findByText('Conectando al servidor...')).toBeInTheDocument();
    unmount1();

    realtime.useOrderEvents.mockReturnValue({ status: 'RECONNECTING' });
    const { unmount: unmount2 } = renderTicket();
    expect(await screen.findByText('Reconectando...')).toBeInTheDocument();
    unmount2();

    realtime.useOrderEvents.mockReturnValue({ status: 'DISCONNECTED' });
    const { unmount: unmount3 } = renderTicket();
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    unmount3();

    realtime.useOrderEvents.mockReturnValue({ status: 'TERMINATED' });
    const { unmount: unmount4 } = renderTicket();
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    unmount4();
  });

  it('renders takeaway label and prop diningSessionId when order does not specify them', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          isTakeaway: true,
          diningSessionId: undefined,
        }),
      ),
    );
    renderTicket(vi.fn(), 'prop-session-abc');
    expect(await screen.findByText(/Para llevar/)).toBeInTheDocument();
    expect(screen.getByText(/Sesión #prop-session-abc/)).toBeInTheDocument();
  });

  it('handles rejectionDetails with source only and without items or missing ingredients', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
          rejectionDetails: {
            source: 'kitchen',
          },
        }),
      ),
    );
    renderTicket();
    expect(
      await screen.findByText(
        'Motivo de rechazo: Inventario insuficiente. Modifica la comanda para ajustar cantidades o cancela.',
      ),
    ).toBeInTheDocument();
  });

  it('handles rejectionDetails as null or empty object', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
          rejectionDetails: {},
        }),
      ),
    );
    renderTicket();
    expect(
      await screen.findByText(
        'Motivo de rechazo: Inventario insuficiente. Modifica la comanda para ajustar cantidades o cancela.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Detalle de rechazo de inventario')).not.toBeInTheDocument();
  });

  it('handles order with status PAID, WASTED, and VOIDED with correct labels and no alert', async () => {
    for (const st of [OrderStatus.PAID, OrderStatus.WASTED, OrderStatus.VOIDED]) {
      server.use(
        http.get('*/orders/:orderId', () =>
          HttpResponse.json({
            ...order,
            status: st,
          }),
        ),
      );
      const { unmount } = renderTicket();
      expect(await screen.findByRole('heading', { name: 'Comanda #102' })).toBeInTheDocument();
      expect(document.querySelector('.order-ticket__alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
      unmount();
    }
  });

  it('hides Quitar platillo when only one item and handles modifier and note inputs', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          items: [
            {
              ...order.items[0],
              id: 'single-item',
              modifiers: ['Queso'],
              notes: 'Nota 1',
            },
          ],
        }),
      ),
    );
    renderTicket();
    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
    expect(screen.queryByRole('button', { name: 'Quitar platillo' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Modificadores de Ensalada César'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Notas de Ensalada César'), {
      target: { value: 'Nueva nota' },
    });
    expect(screen.getByLabelText('Modificadores de Ensalada César')).toHaveValue('');
    expect(screen.getByLabelText('Notas de Ensalada César')).toHaveValue('Nueva nota');
  });

  it('supports tablet touch stepper (+/- buttons) and prevents zero-lock when clearing quantity', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          items: [{ ...order.items[0], quantity: 2 }],
        }),
      ),
    );
    renderTicket();
    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));

    const decreaseBtn = screen.getByRole('button', {
      name: 'Disminuir cantidad de Ensalada César',
    });
    const increaseBtn = screen.getByRole('button', {
      name: 'Aumentar cantidad de Ensalada César',
    });
    const input = screen.getByLabelText('Cantidad de Ensalada César');

    expect(input).toHaveValue(2);
    expect(decreaseBtn).toBeEnabled();

    // Click decrease: 2 -> 1
    fireEvent.click(decreaseBtn);
    expect(input).toHaveValue(1);
    expect(decreaseBtn).toBeDisabled();

    // Click increase: 1 -> 2
    fireEvent.click(increaseBtn);
    expect(input).toHaveValue(2);
    expect(decreaseBtn).toBeEnabled();

    // Clearing input allows empty string without forcing 0
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
  });

  it('formats ingredient names with underscores into readable spaces in rejection details', async () => {
    server.use(
      http.get('*/orders/:orderId', () =>
        HttpResponse.json({
          ...order,
          status: OrderStatus.REJECTED,
          rejectionDetails: {
            missingIngredients: ['pan_brioche', 'queso_cheddar'],
            rejectedItems: [
              {
                dishId: 'dish-burger-1',
                name: 'Hamburguesa Doble Queso',
                requestedQuantity: 3,
                availableQuantity: 1,
                reason: 'Stock insuficiente en almacén',
              },
            ],
            reservedItems: [],
          },
        }),
      ),
    );
    renderTicket();

    expect(await screen.findByText('Detalle de rechazo de inventario')).toBeInTheDocument();
    expect(screen.getByText(/pan brioche, queso cheddar/)).toBeInTheDocument();
    expect(screen.getByText(/inventario insuficiente en almacén/i)).toBeInTheDocument();
  });

  it('allows adding a new dish via + Agregar platillo dialog in edit mode and persists via PATCH', async () => {
    let capturedPayload: unknown = null;
    server.use(
      http.patch('*/orders/:orderId/items', async ({ request }) => {
        capturedPayload = await request.json();
        return HttpResponse.json({
          ...order,
          items: [
            ...order.items,
            {
              id: 'item-new-1',
              dishId: 'dish-burger-doble',
              name: 'Hamburguesa Doble Queso',
              quantity: 2,
              status: 'PENDING',
              modifiers: [],
              notes: '',
            },
          ],
        });
      }),
    );

    renderTicket();

    fireEvent.click(await screen.findByRole('button', { name: 'Modificar' }));
    fireEvent(
      window,
      new CustomEvent('fmat:comanda:open-add-dialog', {
        detail: {
          dishId: 'dish-burger-doble',
          name: 'Hamburguesa Doble Queso',
          unitPrice: 160.0,
        },
      }),
    );

    expect(screen.getByTestId('add-dish-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('add-dish-name-input')).toHaveValue('Hamburguesa Doble Queso');
    fireEvent.change(screen.getByTestId('add-dish-quantity-input'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByTestId('add-dish-submit-btn'));

    expect(screen.queryByTestId('add-dish-dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Hamburguesa Doble Queso')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(capturedPayload).toEqual({
        items: [
          expect.objectContaining({ name: 'Ensalada César' }),
          expect.objectContaining({ name: 'Hamburguesa Doble Queso', quantity: 2 }),
        ],
      });
    });
  });

  it('handles fmat:comanda:add-item DOM event and merges into draft items', async () => {
    renderTicket();
    await screen.findByRole('heading', { name: 'Comanda #102' });

    fireEvent(
      window,
      new CustomEvent('fmat:comanda:add-item', {
        detail: {
          dishId: 'dish-fries-1',
          name: 'Papas Francesas',
          quantity: 2,
          modifiers: ['Poco picante'],
          notes: 'Bien crujientes',
        },
      }),
    );

    expect(await screen.findByText('Papas Francesas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('supports draft mode: configures table/takeaway, adds dish, and submits to kitchen', async () => {
    let orderCreatedPayload: unknown = null;
    let itemsPayload: unknown = null;
    let confirmCalled = false;

    server.use(
      http.post('*/orders', async ({ request }) => {
        orderCreatedPayload = await request.json();
        return HttpResponse.json(
          {
            id: 'ord-draft-new',
            orderNumber: 999,
            tableNumber: 5,
            isTakeaway: false,
            status: OrderStatus.CREATED,
            items: [],
            version: 1,
            responsibleWaiterId: 'waiter-7',
            createdAt: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
      http.patch('*/orders/:orderId/items', async ({ request }) => {
        itemsPayload = await request.json();
        return HttpResponse.json({
          id: 'ord-draft-new',
          orderNumber: 999,
          tableNumber: 5,
          isTakeaway: false,
          status: OrderStatus.CREATED,
          items: [
            {
              id: 'item-created-1',
              name: 'Tacos al Pastor',
              quantity: 3,
              unitPrice: 45.0,
              status: 'PENDING',
              modifiers: [],
              notes: '',
            },
          ],
          version: 2,
          responsibleWaiterId: 'waiter-7',
          createdAt: new Date().toISOString(),
        });
      }),
      http.post('*/orders/:orderId/confirm', () => {
        confirmCalled = true;
        return HttpResponse.json({
          id: 'ord-draft-new',
          orderNumber: 999,
          tableNumber: 5,
          isTakeaway: false,
          status: OrderStatus.CREATED,
          items: [
            {
              id: 'item-created-1',
              name: 'Tacos al Pastor',
              quantity: 3,
              unitPrice: 45.0,
              status: 'PENDING',
              modifiers: [],
              notes: '',
            },
          ],
          version: 3,
          responsibleWaiterId: 'waiter-7',
          confirmedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }),
    );

    const onOrderCreated = vi.fn();
    const onOrderSubmitted = vi.fn();

    render(
      <OrderTicketWidget
        userId="waiter-7"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        webSocketBaseUrl="ws://localhost"
        tableNumber={5}
        onOrderCreated={onOrderCreated}
        onOrderSubmitted={onOrderSubmitted}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nueva Comanda' })).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByText('Esta comanda todavía no tiene platillos.')).toBeInTheDocument();

    fireEvent(
      window,
      new CustomEvent('fmat:comanda:open-add-dialog', {
        detail: {
          dishId: 'dish-pastor',
          name: 'Tacos al Pastor',
          unitPrice: 45.0,
        },
      }),
    );

    expect(screen.getByTestId('add-dish-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('add-dish-name-input')).toHaveValue('Tacos al Pastor');
    fireEvent.change(screen.getByTestId('add-dish-quantity-input'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByTestId('add-dish-submit-btn'));

    expect(screen.getByText('Tacos al Pastor')).toBeInTheDocument();

    const submitKitchenBtn = screen.getByTestId('order-ticket-create-confirm-btn');
    fireEvent.click(submitKitchenBtn);

    await waitFor(() => {
      expect(confirmCalled).toBe(true);
    });

    expect(orderCreatedPayload).toEqual(
      expect.objectContaining({
        tableNumber: 5,
        isTakeaway: false,
      }),
    );
    expect(itemsPayload).toEqual({
      items: [
        expect.objectContaining({
          name: 'Tacos al Pastor',
          quantity: 3,
        }),
      ],
    });
    expect(onOrderCreated).toHaveBeenCalledTimes(1);
    expect(onOrderSubmitted).toHaveBeenCalledWith('ord-draft-new');
  });

  it('supports draft mode: saves draft without confirmation and allows discard', async () => {
    let confirmCalled = false;
    server.use(
      http.post('*/orders', () =>
        HttpResponse.json(
          {
            id: 'ord-draft-save',
            orderNumber: 888,
            tableNumber: 2,
            isTakeaway: false,
            status: OrderStatus.CREATED,
            items: [],
            version: 1,
            responsibleWaiterId: 'waiter-7',
            createdAt: new Date().toISOString(),
          },
          { status: 201 },
        ),
      ),
      http.patch('*/orders/:orderId/items', () =>
        HttpResponse.json({
          id: 'ord-draft-save',
          orderNumber: 888,
          tableNumber: 2,
          isTakeaway: false,
          status: OrderStatus.CREATED,
          items: [
            {
              id: 'item-draft-1',
              name: 'Refresco Cola',
              quantity: 1,
              unitPrice: 30.0,
              status: 'PENDING',
              modifiers: [],
              notes: '',
            },
          ],
          version: 2,
          responsibleWaiterId: 'waiter-7',
          createdAt: new Date().toISOString(),
        }),
      ),
      http.post('*/orders/:orderId/confirm', () => {
        confirmCalled = true;
        return HttpResponse.json({});
      }),
    );

    const onOrderCreated = vi.fn();
    const onCreateNewOrder = vi.fn();

    const { unmount } = render(
      <OrderTicketWidget
        userId="waiter-7"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        webSocketBaseUrl="ws://localhost"
        tableNumber={2}
        onOrderCreated={onOrderCreated}
        onCreateNewOrder={onCreateNewOrder}
      />,
    );

    fireEvent(
      window,
      new CustomEvent('fmat:comanda:open-add-dialog', {
        detail: {
          dishId: 'dish-soda',
          name: 'Refresco Cola',
          unitPrice: 30.0,
        },
      }),
    );

    expect(screen.getByTestId('add-dish-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-dish-submit-btn'));

    fireEvent.click(screen.getByTestId('order-ticket-create-draft-btn'));

    await waitFor(() => {
      expect(onOrderCreated).toHaveBeenCalledTimes(1);
    });
    expect(confirmCalled).toBe(false);

    unmount();

    // Now test discard in draft mode
    render(
      <OrderTicketWidget
        userId="waiter-7"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        onCreateNewOrder={onCreateNewOrder}
      />,
    );

    fireEvent.click(screen.getByTestId('order-ticket-discard-btn'));
    expect(onCreateNewOrder).toHaveBeenCalledTimes(1);
  });
});
