import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import { buildInitialPresets } from '../../src/features/dev-sandbox/mockSandboxFetch.ts';
import { OrderCard } from '../../src/features/kds-board/OrderCard.tsx';
import { UserRole } from '../../src/shared/types/auth.ts';

let capturedProps: {
  orderId?: string;
  onCreateNewOrder?: () => void;
  onOrderSubmitted?: (id: string) => void;
  fetchFn?: typeof fetch;
  WebSocketClass?: typeof WebSocket;
} = {};

let capturedKdsClient: { get: (path: string) => Promise<unknown> } | undefined;

// Mock sub-applications to isolate App view switcher and test injected mocks
vi.mock('../../src/KdsApp.tsx', () => ({
  default: (props: { userRole?: UserRole; client?: { get: (path: string) => Promise<unknown> } }) => {
    capturedKdsClient = props.client;
    return (
      <div
        data-testid="mock-kds-app"
        data-user-role={props.userRole ?? 'none'}
        data-has-mock-client={props.client ? 'true' : 'false'}
      >
        KdsApp Screen
      </div>
    );
  },
}));

vi.mock('../../src/OrderTicketWidget.tsx', () => ({
  default: (props: typeof capturedProps) => {
    capturedProps = props;
    return (
      <div data-testid="mock-order-ticket-widget">
        <span>OrderTicketWidget Active Order: {props.orderId ?? 'draft'}</span>
        <button
          type="button"
          onClick={props.onCreateNewOrder}
          data-testid="mock-create-new-order-btn"
        >
          Create New Order
        </button>
        <button
          type="button"
          onClick={() => props.onOrderSubmitted?.('ord-sim-created')}
          data-testid="mock-submit-new-order-btn"
        >
          Submit Order
        </button>
      </div>
    );
  },
}));

vi.mock('../../src/ReadyOrdersAlert.tsx', () => ({
  ReadyOrdersAlert: () => (
    <div data-testid="mock-ready-orders-alert">ReadyOrdersAlert Screen</div>
  ),
}));

describe('App Dev View Switcher and Shared Sandbox (AppViews)', () => {
  it('navigates between KDS, Ticket, and Alerts views and toggles KDS memory simulator', () => {
    render(<App />);

    // Default view: KDS using backend client initially for E2E route compatibility
    const kds = screen.getByTestId('mock-kds-app');
    expect(kds).toBeInTheDocument();
    expect(kds).toHaveAttribute('data-has-mock-client', 'false');

    // Toggle KDS memory simulator manually
    const toggleMockBtn = screen.getByRole('button', { name: /kds: backend/i });
    fireEvent.click(toggleMockBtn);
    expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-has-mock-client', 'true');
    expect(capturedKdsClient).toBeDefined();

    // Switch to Ticket view
    const ticketTab = screen.getByRole('button', { name: /orden mesero/i });
    fireEvent.click(ticketTab);

    expect(screen.getByTestId('mock-order-ticket-widget')).toBeInTheDocument();
    expect(screen.getByText('Mesa 4 (Creada)')).toBeInTheDocument();

    // Switch to Alerts view
    const alertsTab = screen.getByRole('button', { name: /alerta órdenes listas/i });
    fireEvent.click(alertsTab);

    expect(screen.getByTestId('mock-ready-orders-alert')).toBeInTheDocument();

    // Switch back to KDS view
    const kdsTab = screen.getByRole('button', { name: /kds cocina/i });
    fireEvent.click(kdsTab);

    expect(screen.getByTestId('mock-kds-app')).toBeInTheDocument();
  });

  it('cycles through all lifecycle presets, blank draft mode, and quick controls', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /orden mesero/i }));

    // Blank draft mode
    fireEvent.click(screen.getByRole('button', { name: /borrador blanco/i }));
    expect(screen.getByText(/OrderTicketWidget Active Order: draft/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-submit-new-order-btn'));
    expect(screen.getByText(/ord-sim-created/)).toBeInTheDocument();

    // Stock rejected preset
    const rejectedPresetBtn = screen.getByText('⚠️ Rechazo Stock (Inventario)');
    fireEvent.click(rejectedPresetBtn);
    expect(rejectedPresetBtn).toHaveClass('bg-red-600');
    expect(screen.getByText(/ord-rechazada-stock/)).toBeInTheDocument();

    // Reserved preset
    const reservedPresetBtn = screen.getByText('Mesa 12 (Reservada)');
    fireEvent.click(reservedPresetBtn);
    expect(reservedPresetBtn).toHaveClass('bg-emerald-600');
    expect(screen.getByText(/ord-reservada-kds/)).toBeInTheDocument();

    // Expired TTL >15m preset
    const expiredPresetBtn = screen.getByText('⏱️ Mesa 11 (Caducada >15m)');
    fireEvent.click(expiredPresetBtn);
    expect(expiredPresetBtn).toHaveClass('bg-amber-600');
    expect(screen.getByText(/ord-caducada-ttl/)).toBeInTheDocument();

    // In Preparation preset
    const prepPresetBtn = screen.getByText('🍳 Mesa 6 (En Prep)');
    fireEvent.click(prepPresetBtn);
    expect(prepPresetBtn).toHaveClass('bg-orange-600');
    expect(screen.getByText(/ord-en-preparacion/)).toBeInTheDocument();

    // Delivered / Redo preset
    const redoPresetBtn = screen.getByText('Mesa 3 (Rehacer)');
    fireEvent.click(redoPresetBtn);
    expect(redoPresetBtn).toHaveClass('bg-purple-600');
    expect(screen.getByText(/ord-entregada-rehacer/)).toBeInTheDocument();

    // Quick simulation controls & Menu DOM dispatch
    const eventListener = vi.fn();
    window.addEventListener('fmat:orden:add-item', eventListener);
    fireEvent.click(screen.getByRole('button', { name: '+ Menú: Tacos al Pastor' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Menú: Hamburguesa' }));
    expect(eventListener).toHaveBeenCalledTimes(2);
    window.removeEventListener('fmat:orden:add-item', eventListener);

    fireEvent.click(screen.getByText('Mesa 12 (Reservada)'));
    fireEvent.click(screen.getByRole('button', { name: 'Cocina: Iniciar Prep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cocina: Entregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular Rechazo Stock' }));
    fireEvent.click(screen.getByRole('button', { name: /caducar ttl/i }));

    // Trigger onCreateNewOrder callback -> transitions to blank draft mode
    fireEvent.click(screen.getByTestId('mock-create-new-order-btn'));
    expect(screen.getByText(/OrderTicketWidget Active Order: draft/)).toBeInTheDocument();

    // Shortcut to jump to KDS view
    fireEvent.click(screen.getByRole('button', { name: /ver en kds cocina/i }));
    expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-has-mock-client', 'true');
  });

  it('selects live seed orders including REJECTED and expired TTL and applies custom UUIDs', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /orden mesero/i }));

    fireEvent.click(screen.getByText('Seed Creada'));
    expect(screen.getByText('Live Backend')).toBeInTheDocument();
    expect(screen.getByText(/44444444-4444-4444-4444-444444444444/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed Reservada'));
    expect(screen.getByText(/11111111-1111-1111-1111-111111111111/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed En Prep'));
    expect(screen.getByText(/22222222-2222-2222-2222-222222222222/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed Entregada (Rehacer Real)'));
    expect(screen.getByText(/33333333-3333-3333-3333-333333333333/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed Rechazada'));
    expect(screen.getByText(/77777777-7777-7777-7777-777777777777/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Seed Caducada (>15m)'));
    expect(screen.getByText(/88888888-8888-8888-8888-888888888888/)).toBeInTheDocument();

    const input = screen.getByPlaceholderText('UUID de Orden...');
    const loadBtn = screen.getByRole('button', { name: 'Cargar' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(loadBtn);

    fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789abc' } });
    fireEvent.click(loadBtn);
    expect(screen.getByText('Live Backend')).toBeInTheDocument();
    expect(screen.getByText(/12345678-1234-1234-1234-123456789abc/)).toBeInTheDocument();
  });

  describe('Shared Waiter <-> KDS mockFetch and MockWebSocket lifecycle', () => {
    it('executes full end-to-end Waiter and KDS lifecycle transitions against shared state', async () => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /orden mesero/i }));
      fireEvent.click(screen.getByText('Mesa 4 (Creada)'));

      const fetchFn = capturedProps.fetchFn;
      expect(fetchFn).toBeDefined();
      if (!fetchFn) return;

      // 1. POST /orders creates a new blank CREATED order in shared store
      const postRes = await fetchFn('http://localhost/orders', {
        method: 'POST',
        body: JSON.stringify({ tableNumber: 15, isTakeaway: false, diningSessionId: 'ses-15' }),
      });
      expect(postRes.status).toBe(201);
      const createdOrder = await postRes.json();
      expect(createdOrder.status).toBe('CREATED');
      const createdId = createdOrder.id as string;

      // 2. PATCH /orders/:id/items populates dishes (including original prep note)
      const patchItemsRes = await fetchFn(`http://localhost/orders/${createdId}/items`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: [
            { id: 'itm-a', name: 'Sopa Azteca', quantity: 2, unitPrice: 90, notes: 'BIEN COCIDO' },
            { id: 'itm-b', name: 'Flan Napolitano', quantity: 1, unitPrice: 70 },
          ],
        }),
      });
      expect(patchItemsRes.status).toBe(200);
      const withItems = await patchItemsRes.json();
      expect(withItems.items).toHaveLength(2);
      expect(withItems.totalAmount).toBe(250);

      // 3. POST /orders/:id/confirm moves order to RESERVED and exposes it in KDS active queue
      const confirmRes = await fetchFn(`http://localhost/orders/${createdId}/confirm`, {
        method: 'POST',
      });
      expect(confirmRes.status).toBe(200);
      expect((await confirmRes.json()).status).toBe('RESERVED');

      const kdsActiveRes = await fetchFn('http://localhost/kds/queue?view=active');
      const kdsActiveOrders = (await kdsActiveRes.json()) as Array<{ id: string }>;
      expect(kdsActiveOrders.some((o) => o.id === createdId)).toBe(true);

      // 4. PATCH /orders/:id/start-preparation transitions to IN_PREPARATION
      const startRes = await fetchFn(`http://localhost/orders/${createdId}/start-preparation`, {
        method: 'PATCH',
      });
      expect((await startRes.json()).status).toBe('IN_PREPARATION');

      // 5. Mark individual items READY -> auto transitions order to DELIVERED when all ready
      const readyFirst = await fetchFn(
        `http://localhost/orders/${createdId}/items/itm-a/ready`,
        { method: 'PATCH' },
      );
      expect((await readyFirst.json()).status).toBe('IN_PREPARATION');

      const readySecond = await fetchFn(
        `http://localhost/orders/${createdId}/items/itm-b/ready`,
        { method: 'PATCH' },
      );
      expect((await readySecond.json()).status).toBe('DELIVERED');

      const kdsDeliveredRes = await fetchFn('http://localhost/kds/queue?view=delivered');
      const kdsDelivered = (await kdsDeliveredRes.json()) as Array<{ id: string }>;
      expect(kdsDelivered.some((o) => o.id === createdId)).toBe(true);

      // 6. Waiter requests redo -> item returns to PENDING with redo note; completing redo restores original note
      const redoRes = await fetchFn(
        `http://localhost/orders/${createdId}/items/itm-a/redo`,
        {
          method: 'PATCH',
          body: JSON.stringify({ note: 'Sopa llegó tibia' }),
        },
      );
      const redoOrder = await redoRes.json();
      expect(redoOrder.items[0].status).toBe('PENDING');
      expect(redoOrder.items[0].notes).toBe('Sopa llegó tibia');

      const redoReadyRes = await fetchFn(
        `http://localhost/orders/${createdId}/items/itm-a/ready`,
        { method: 'PATCH' },
      );
      const redoReadyOrder = await redoReadyRes.json();
      expect(redoReadyOrder.items[0].status).toBe('DELIVERED');
      expect(redoReadyOrder.items[0].notes).toBe('BIEN COCIDO');

      // Re-open redo item to test kitchen reject partial availability + request-bill
      await fetchFn(`http://localhost/orders/${createdId}/items/itm-a/redo`, {
        method: 'PATCH',
        body: JSON.stringify({ note: 'Repetir prueba' }),
      });

      // 7. Kitchen reject with partial availableQuantity + reopen draft on PATCH /items
      const rejectRes = await fetchFn(
        `http://localhost/orders/${createdId}/items/itm-a/kitchen-reject`,
        {
          method: 'PATCH',
          body: JSON.stringify({ reason: 'Sin tortilla frita', availableQuantity: 1 }),
        },
      );
      const rejectedOrder = await rejectRes.json();
      expect(rejectedOrder.status).toBe('REJECTED');
      expect(rejectedOrder.rejectionDetails.rejectedItems[0].availableQuantity).toBe(1);
      expect(rejectedOrder.rejectionDetails.reservedItems[0].reservedQuantity).toBe(1);

      const reopenRes = await fetchFn(`http://localhost/orders/${createdId}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ items: [{ id: 'itm-b', name: 'Flan Napolitano', quantity: 1 }] }),
      });
      expect((await reopenRes.json()).status).toBe('CREATED');

      // 8. Whole order ready, request-bill, GET /orders, void, void-kitchen-error, cancel, and 404
      expect(
        (await (await fetchFn(`http://localhost/orders/${createdId}/ready`, { method: 'PATCH' })).json())
          .status,
      ).toBe('DELIVERED');
      expect(
        (
          await (
            await fetchFn(`http://localhost/orders/${createdId}/request-bill`, { method: 'POST' })
          ).json()
        ).status,
      ).toBe('PAID');
      const allOrdersRes = await fetchFn('http://localhost/orders');
      expect(allOrdersRes.status).toBe(200);
      expect((await allOrdersRes.json()).length).toBeGreaterThan(0);
      expect(
        (await (await fetchFn(`http://localhost/orders/${createdId}/void`, { method: 'PATCH' })).json())
          .status,
      ).toBe('VOIDED');
      expect(
        (
          await (
            await fetchFn(`http://localhost/orders/${createdId}/void-kitchen-error`, {
              method: 'PATCH',
            })
          ).json()
        ).status,
      ).toBe('WASTED');
      expect(
        (
          await (
            await fetchFn('http://localhost/orders/ord-mesa-4/cancel', { method: 'PATCH' })
          ).json()
        ).status,
      ).toBe('CANCELLED');
      expect((await fetchFn('http://localhost/orders/unknown-order-404')).status).toBe(404);
    });

    it('exercises MockWebSocket lifecycle', async () => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /orden mesero/i }));
      fireEvent.click(screen.getByText('Mesa 4 (Creada)'));

      const WebSocketClass = capturedProps.WebSocketClass;
      expect(WebSocketClass).toBeDefined();
      if (!WebSocketClass) return;

      const ws = new WebSocketClass('ws://localhost/dummy');
      expect(ws.readyState).toBe(1);

      const openSpy = vi.fn();
      const closeSpy = vi.fn();
      ws.onopen = openSpy;
      ws.onclose = closeSpy;

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalled();
      });

      ws.send('ping');
      ws.close();
      expect(ws.readyState).toBe(3);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('switches between Admin, Chef, Cocinero, and Mesero roles in DevSandboxApp and toggles role-specific KDS void buttons', () => {
      render(<App />);

      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'admin');

      fireEvent.click(screen.getByTestId('dev-role-chef'));
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'chef');

      fireEvent.click(screen.getByTestId('dev-role-kitchen'));
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'kitchen');

      fireEvent.click(screen.getByTestId('dev-role-waiter'));
      expect(screen.getByTestId('mock-order-ticket-widget')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('dev-role-admin'));
      fireEvent.click(screen.getByRole('button', { name: '🍳 KDS Cocina' }));
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'admin');

      const inPrepOrder = buildInitialPresets()['ord-en-preparacion'];
      const { rerender } = render(
        <OrderCard
          order={inPrepOrder}
          userRole={UserRole.ADMIN}
          onAdminVoid={vi.fn()}
          onChefVoid={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /anulación administrativa/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /anulación por error de cocina/i })).toBeInTheDocument();

      rerender(
        <OrderCard
          order={inPrepOrder}
          userRole={UserRole.CHEF}
          onAdminVoid={vi.fn()}
          onChefVoid={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /anulación administrativa/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /anulación por error de cocina/i })).toBeInTheDocument();

      rerender(
        <OrderCard
          order={inPrepOrder}
          userRole={UserRole.KITCHEN}
          onAdminVoid={vi.fn()}
          onChefVoid={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /anulación administrativa/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /anulación por error de cocina/i })).not.toBeInTheDocument();
    });

    it('supports creating new real backend orders with TEST_DATA dishes without reverting to mock mode', () => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /orden mesero/i }));
      fireEvent.click(screen.getByTestId('sandbox-backend-new-order-btn'));

      expect(screen.getByText('Live Backend')).toBeInTheDocument();
      expect(screen.getByText(/OrderTicketWidget Active Order: draft/)).toBeInTheDocument();
      expect(capturedProps.fetchFn).toBeUndefined();
      expect(capturedProps.WebSocketClass).toBeUndefined();

      const eventListener = vi.fn();
      window.addEventListener('fmat:orden:add-item', eventListener);
      expect(screen.getByTestId('backend-quick-menu-bar')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /\+ Menú Real: Hamburguesa clásica/i }));
      expect(eventListener).toHaveBeenCalledTimes(1);
      const customEvent = eventListener.mock.calls[0]?.[0] as CustomEvent<Record<string, unknown>>;
      expect(customEvent.detail).toEqual({
        dishId: 'PLATE-BURGER-01',
        sourceId: 'PLATE-BURGER-01',
        offerId: 'OFFER-BURGER-01',
        name: 'Hamburguesa clásica',
        unitPrice: 165,
        quantity: 1,
      });
      window.removeEventListener('fmat:orden:add-item', eventListener);

      fireEvent.click(screen.getByTestId('mock-create-new-order-btn'));
      expect(screen.getByText('Live Backend')).toBeInTheDocument();
      expect(capturedProps.fetchFn).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: /ver en kds cocina/i }));
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-has-mock-client', 'false');
    });
  });
});
