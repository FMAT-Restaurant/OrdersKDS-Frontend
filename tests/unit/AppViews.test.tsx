import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';

let capturedProps: {
  orderId?: string;
  onCreateNewOrder?: () => void;
  fetchFn?: typeof fetch;
  WebSocketClass?: typeof WebSocket;
} = {};

// Mock sub-applications to isolate App view switcher and test injected mocks
vi.mock('../../src/KdsApp.tsx', () => ({
  default: () => <div data-testid="mock-kds-app">KdsApp Screen</div>,
}));

vi.mock('../../src/OrderTicketWidget.tsx', () => ({
  default: (props: typeof capturedProps) => {
    capturedProps = props;
    return (
      <div data-testid="mock-order-ticket-widget">
        <span>OrderTicketWidget Active Order: {props.orderId}</span>
        <button
          type="button"
          onClick={props.onCreateNewOrder}
          data-testid="mock-create-new-order-btn"
        >
          Create New Order
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

describe('App Dev View Switcher and Presets (AppViews)', () => {
  it('navigates between KDS, Ticket, and Alerts views', () => {
    render(<App />);

    // Default view: KDS
    expect(screen.getByTestId('mock-kds-app')).toBeInTheDocument();

    // Switch to Ticket view
    const ticketTab = screen.getByRole('button', { name: /comanda mesero/i });
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

  it('cycles through preset orders and triggers onCreateNewOrder in Ticket view', () => {
    render(<App />);

    // Switch to Ticket view
    fireEvent.click(screen.getByRole('button', { name: /comanda mesero/i }));

    // Click Presets
    const rejectedPresetBtn = screen.getByText('⚠️ Rechazo Stock (Inventario)');
    fireEvent.click(rejectedPresetBtn);
    expect(rejectedPresetBtn).toHaveClass('bg-red-600');
    expect(screen.getByText(/ord-rechazada-stock/)).toBeInTheDocument();

    const reservedPresetBtn = screen.getByText('Mesa 12 (Reservada)');
    fireEvent.click(reservedPresetBtn);
    expect(reservedPresetBtn).toHaveClass('bg-emerald-600');
    expect(screen.getByText(/ord-reservada-kds/)).toBeInTheDocument();

    const redoPresetBtn = screen.getByText('Mesa 3 (Rehacer)');
    fireEvent.click(redoPresetBtn);
    expect(redoPresetBtn).toHaveClass('bg-purple-600');
    expect(screen.getByText(/ord-entregada-rehacer/)).toBeInTheDocument();

    const createdPresetBtn = screen.getByText('Mesa 4 (Creada)');
    fireEvent.click(createdPresetBtn);
    expect(createdPresetBtn).toHaveClass('bg-blue-500');
    expect(screen.getByText(/ord-mesa-4/)).toBeInTheDocument();

    // Trigger onCreateNewOrder callback
    const createNewOrderBtn = screen.getByTestId('mock-create-new-order-btn');
    fireEvent.click(createNewOrderBtn);
    expect(screen.getByText(/ord-mesa-4/)).toBeInTheDocument();
  });

  it('selects live seed orders and applies custom UUIDs in Ticket view', () => {
    render(<App />);

    // Switch to Ticket view
    fireEvent.click(screen.getByRole('button', { name: /comanda mesero/i }));

    // Click Live Seed Creada
    const seedCreatedBtn = screen.getByText('Seed Creada');
    fireEvent.click(seedCreatedBtn);
    expect(screen.getByText('Live Backend')).toBeInTheDocument();
    expect(screen.getByText(/44444444-4444-4444-4444-444444444444/)).toBeInTheDocument();

    // Click Live Seed Reservada
    const seedReservedBtn = screen.getByText('Seed Reservada');
    fireEvent.click(seedReservedBtn);
    expect(screen.getByText('Live Backend')).toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-1111-1111-111111111111/)).toBeInTheDocument();

    // Click Live Seed En Prep
    const seedInPrepBtn = screen.getByText('Seed En Prep');
    fireEvent.click(seedInPrepBtn);
    expect(screen.getByText(/22222222-2222-2222-2222-222222222222/)).toBeInTheDocument();

    // Click Live Seed Entregada
    const seedDeliveredBtn = screen.getByText('Seed Entregada (Rehacer Real)');
    fireEvent.click(seedDeliveredBtn);
    expect(screen.getByText(/33333333-3333-3333-3333-333333333333/)).toBeInTheDocument();

    // Custom UUID input
    const input = screen.getByPlaceholderText('UUID de Orden...');
    const loadBtn = screen.getByRole('button', { name: 'Cargar' });

    // Empty input should not crash or change
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(loadBtn);

    // Valid UUID input
    fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789abc' } });
    fireEvent.click(loadBtn);
    expect(screen.getByText('Live Backend')).toBeInTheDocument();
    expect(screen.getByText(/12345678-1234-1234-1234-123456789abc/)).toBeInTheDocument();
  });

  describe('In-memory MockWebSocket and mockFetch coverage', () => {
    it('exercises mockFetch operations for ticket simulation mode', async () => {
      render(<App />);

      // Switch to Ticket view so mockFetch is generated
      fireEvent.click(screen.getByRole('button', { name: /comanda mesero/i }));
      // Select preset to ensure in-memory mode
      fireEvent.click(screen.getByText('Mesa 4 (Creada)'));

      const fetchFn = capturedProps.fetchFn;
      expect(fetchFn).toBeDefined();
      if (!fetchFn) return;

      // GET order
      const getRes = await fetchFn('http://localhost/orders/ord-mesa-4');
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.id).toBe('ord-mesa-4');

      // POST /confirm
      const confirmRes = await fetchFn('http://localhost/orders/ord-mesa-4/confirm', {
        method: 'POST',
      });
      expect(confirmRes.status).toBe(200);
      const confirmData = await confirmRes.json();
      expect(confirmData.status).toBe('RESERVED');

      // PATCH /cancel
      const cancelRes = await fetchFn('http://localhost/orders/ord-mesa-4/cancel', {
        method: 'PATCH',
      });
      expect(cancelRes.status).toBe(200);
      const cancelData = await cancelRes.json();
      expect(cancelData.status).toBe('CANCELLED');

      // PATCH /items replace
      const itemsRes = await fetchFn('http://localhost/orders/ord-mesa-4/items', {
        method: 'PATCH',
        body: JSON.stringify({
          items: [{ name: 'Hamburguesa Doble', quantity: 3 }],
        }),
      });
      expect(itemsRes.status).toBe(200);
      const itemsData = await itemsRes.json();
      expect(itemsData.items[0].name).toBe('Hamburguesa Doble');

      // Select delivered preset for redo
      fireEvent.click(screen.getByText('Mesa 3 (Rehacer)'));
      const redoRes = await fetchFn(
        'http://localhost/orders/ord-entregada-rehacer/items/item-30/redo',
        {
          method: 'PATCH',
          body: JSON.stringify({ note: 'Cliente solicitó carne bien cocida' }),
        },
      );
      expect(redoRes.status).toBe(200);
      const redoData = await redoRes.json();
      expect(redoData.items[0].status).toBe('PENDING');

      // 404 for unknown order
      const notFoundRes = await fetchFn('http://localhost/orders/unknown-order-404');
      expect(notFoundRes.status).toBe(404);
    });

    it('exercises MockWebSocket lifecycle', async () => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /comanda mesero/i }));
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

      // Let timer fire for onopen
      await waitFor(() => {
        expect(openSpy).toHaveBeenCalled();
      });

      // Send should be safe noop
      ws.send('ping');

      // Close should update readyState and fire onclose
      ws.close();
      expect(ws.readyState).toBe(3);
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
