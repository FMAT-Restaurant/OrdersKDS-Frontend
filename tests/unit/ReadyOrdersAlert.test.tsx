import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadyOrdersAlert } from '../../src/ReadyOrdersAlert.tsx';
import type { UseOrderEventsOptions } from '../../src/shared/realtime/useOrderEvents.ts';
import type { OrderStatusChangedEvent } from '../../src/shared/realtime/types.ts';

const realtime = vi.hoisted(() => ({
  useOrderEvents: vi.fn(),
}));

vi.mock('../../src/shared/realtime/useOrderEvents.ts', () => ({
  useOrderEvents: realtime.useOrderEvents,
}));

describe('ReadyOrdersAlert', () => {
  let eventHandler: (event: OrderStatusChangedEvent) => void;

  beforeEach(() => {
    realtime.useOrderEvents.mockImplementation((options: UseOrderEventsOptions) => {
      eventHandler = options.onOrderStatusChanged ?? (() => undefined);
      return { status: 'CONNECTED', client: null, subscribe: vi.fn(), unsubscribe: vi.fn() };
    });
  });

  const renderAlert = () =>
    render(
      <ReadyOrdersAlert
        userId="waiter-1"
        tokenProvider={async () => 'token'}
        webSocketBaseUrl="ws://localhost:8000"
      />,
    );

  const deliveredEvent = (
    overrides: Partial<OrderStatusChangedEvent> = {},
  ): OrderStatusChangedEvent => ({
    type: 'order.status_changed',
    orderId: 'order-1',
    status: 'DELIVERED',
    version: 1,
    responsibleWaiterId: 'waiter-1',
    ...overrides,
  });

  it('subscribes to waiter websocket channels and announces delivered orders for the user', () => {
    renderAlert();

    expect(realtime.useOrderEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'waiter',
        channels: ['floor', 'user:waiter-1'],
        baseUrl: 'ws://localhost:8000',
      }),
    );
    actOnEvent(deliveredEvent());

    expect(screen.getByRole('alert')).toHaveTextContent('Entregada por cocina — recoger');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByText('Orden order-1')).toBeInTheDocument();
  });

  it('does not announce orders assigned to another waiter', () => {
    renderAlert();
    actOnEvent(deliveredEvent({ responsibleWaiterId: 'waiter-2' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not announce events without a waiter owner or with another status', () => {
    renderAlert();
    actOnEvent(deliveredEvent({ responsibleWaiterId: undefined }));
    actOnEvent(deliveredEvent({ orderId: 'order-2', status: 'IN_PREPARATION' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the newest delivered event per order and allows dismissing it', () => {
    renderAlert();
    actOnEvent(deliveredEvent());
    actOnEvent(deliveredEvent({ version: 1 }));
    actOnEvent(deliveredEvent({ version: 2 }));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso de orden order-1' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  function actOnEvent(event: OrderStatusChangedEvent) {
    act(() => {
      eventHandler(event);
    });
  }
});
