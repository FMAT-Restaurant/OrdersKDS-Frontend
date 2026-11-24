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

function addSampleDishEvent(name = 'Sopa de Lima', price = 95) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('fmat:comanda:add-item', {
        detail: {
          dishId: 'recipe-sopa-1',
          offerId: 'offer-sopa-1',
          name,
          quantity: 1,
          unitPrice: price,
        },
      }),
    );
  });
}

describe('OrderTicketWidget Creation Idempotency & Conflict Recovery', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    queryClient.clear();
    realtime.useOrderEvents.mockReturnValue({ status: 'CONNECTED' });
  });

  it('reuses existing draft order ID when retrying after PATCH /items failure (no duplicate POST /orders)', async () => {
    let postOrderCalls = 0;
    let patchItemsCalls = 0;
    let confirmCalls = 0;

    server.use(
      http.post('*/orders', async () => {
        postOrderCalls += 1;
        return HttpResponse.json(
          {
            id: 'ord-single-1',
            orderId: 'ord-single-1',
            orderNumber: 1,
            status: OrderStatus.CREATED,
            version: 1,
            tableNumber: 4,
            isTakeaway: false,
            totalAmount: 0,
            createdAt: '2026-11-19T00:00:00Z',
            items: [],
          },
          { status: 201 },
        );
      }),
      http.patch('*/orders/ord-single-1/items', async () => {
        patchItemsCalls += 1;
        if (patchItemsCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Temporary database lock timeout' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          id: 'ord-single-1',
          orderId: 'ord-single-1',
          orderNumber: 1,
          status: OrderStatus.CREATED,
          version: 2,
          tableNumber: 4,
          isTakeaway: false,
          totalAmount: 95,
          createdAt: '2026-11-19T00:00:00Z',
          items: [
            {
              id: 'it-1',
              itemId: 'it-1',
              dishId: 'recipe-sopa-1',
              offerId: 'offer-sopa-1',
              name: 'Sopa de Lima',
              quantity: 1,
              unitPrice: 95,
              status: 'PENDING',
              modifiers: [],
            },
          ],
        });
      }),
      http.post('*/orders/ord-single-1/confirm', async () => {
        confirmCalls += 1;
        return HttpResponse.json({
          id: 'ord-single-1',
          orderId: 'ord-single-1',
          orderNumber: 1,
          status: OrderStatus.RESERVED,
          version: 3,
          tableNumber: 4,
          isTakeaway: false,
          totalAmount: 95,
          createdAt: '2026-11-19T00:00:00Z',
          items: [],
        });
      }),
    );

    const handleSubmitted = vi.fn();

    render(
      <OrderTicketWidget
        tableNumber={4}
        userId="waiter-1"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
        onOrderSubmitted={handleSubmitted}
      />,
    );

    addSampleDishEvent();

    const sendBtn = await screen.findByTestId('order-ticket-create-confirm-btn');
    fireEvent.click(sendBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(postOrderCalls).toBe(1);
    expect(patchItemsCalls).toBe(1);

    fireEvent.click(screen.getByTestId('order-ticket-create-confirm-btn'));

    await waitFor(() => {
      expect(patchItemsCalls).toBe(2);
      expect(confirmCalls).toBe(1);
      expect(handleSubmitted).toHaveBeenCalledWith('ord-single-1');
    });
    expect(postOrderCalls).toBe(1);
  });

  it('promotes order after PATCH /items succeeds so retry after POST /confirm failure only confirms', async () => {
    let postOrderCalls = 0;
    let patchItemsCalls = 0;
    let confirmCalls = 0;

    const attachedOrder = {
      id: 'ord-retry-confirm-1',
      orderId: 'ord-retry-confirm-1',
      orderNumber: 2,
      status: OrderStatus.CREATED,
      version: 2,
      tableNumber: 7,
      isTakeaway: false,
      totalAmount: 95,
      createdAt: '2026-11-19T00:00:00Z',
      items: [
        {
          id: 'it-1',
          itemId: 'it-1',
          dishId: 'recipe-sopa-1',
          offerId: 'offer-sopa-1',
          name: 'Sopa de Lima',
          quantity: 1,
          unitPrice: 95,
          status: 'PENDING',
          modifiers: [],
        },
      ],
    };

    server.use(
      http.post('*/orders', async () => {
        postOrderCalls += 1;
        return HttpResponse.json({ ...attachedOrder, version: 1, items: [], totalAmount: 0 }, { status: 201 });
      }),
      http.patch('*/orders/ord-retry-confirm-1/items', async () => {
        patchItemsCalls += 1;
        return HttpResponse.json(attachedOrder);
      }),
      http.get('*/orders/ord-retry-confirm-1', async () => HttpResponse.json(attachedOrder)),
      http.post('*/orders/ord-retry-confirm-1/confirm', async () => {
        confirmCalls += 1;
        if (confirmCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Confirm transiently unavailable' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({
          ...attachedOrder,
          status: OrderStatus.RESERVED,
          version: 3,
        });
      }),
    );

    render(
      <OrderTicketWidget
        tableNumber={7}
        userId="waiter-2"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    addSampleDishEvent();
    fireEvent.click(await screen.findByTestId('order-ticket-create-confirm-btn'));

    const confirmExistingBtn = await screen.findByRole('button', { name: 'Confirmar' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(postOrderCalls).toBe(1);
    expect(patchItemsCalls).toBe(1);
    expect(confirmCalls).toBe(1);

    fireEvent.click(confirmExistingBtn);

    await waitFor(() => {
      expect(confirmCalls).toBe(2);
    });
    expect(postOrderCalls).toBe(1);
    expect(patchItemsCalls).toBe(1);
  });

  it('clears pending draft order ID when discarding draft so next order creates a fresh POST /orders', async () => {
    let postOrderCalls = 0;

    server.use(
      http.post('*/orders', async () => {
        postOrderCalls += 1;
        const createdId = `ord-fresh-${postOrderCalls}`;
        return HttpResponse.json(
          {
            id: createdId,
            orderId: createdId,
            orderNumber: postOrderCalls,
            status: OrderStatus.CREATED,
            version: 1,
            tableNumber: 2,
            isTakeaway: false,
            totalAmount: 0,
            createdAt: '2026-11-19T00:00:00Z',
            items: [],
          },
          { status: 201 },
        );
      }),
      http.patch('*/orders/:orderId/items', async ({ params }) => {
        if (params.orderId === 'ord-fresh-1') {
          return HttpResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Retryable item error' } },
            { status: 400 },
          );
        }
        return HttpResponse.json({
          id: String(params.orderId),
          orderId: String(params.orderId),
          orderNumber: 2,
          status: OrderStatus.CREATED,
          version: 2,
          tableNumber: 2,
          isTakeaway: false,
          totalAmount: 95,
          createdAt: '2026-11-19T00:00:00Z',
          items: [
            {
              id: 'it-2',
              itemId: 'it-2',
              dishId: 'recipe-sopa-1',
              name: 'Sopa de Lima',
              quantity: 1,
              unitPrice: 95,
              status: 'PENDING',
              modifiers: [],
            },
          ],
        });
      }),
    );

    render(
      <OrderTicketWidget
        tableNumber={2}
        userId="waiter-3"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    addSampleDishEvent();
    fireEvent.click(await screen.findByTestId('order-ticket-create-draft-btn'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(postOrderCalls).toBe(1);

    fireEvent.click(screen.getByTestId('order-ticket-discard-btn'));
    addSampleDishEvent('Panucho', 40);
    fireEvent.click(await screen.findByTestId('order-ticket-create-draft-btn'));

    await waitFor(() => {
      expect(postOrderCalls).toBe(2);
    });
  });

  it('refetches active order when PATCH /cancel fails with 409 conflict', async () => {
    let getCalls = 0;

    server.use(
      http.get('*/orders/ord-conflict-cancel', async () => {
        getCalls += 1;
        return HttpResponse.json({
          id: 'ord-conflict-cancel',
          orderId: 'ord-conflict-cancel',
          orderNumber: 5,
          status: getCalls > 1 ? OrderStatus.IN_PREPARATION : OrderStatus.CREATED,
          version: getCalls > 1 ? 3 : 2,
          tableNumber: 5,
          isTakeaway: false,
          totalAmount: 100,
          createdAt: '2026-11-19T00:00:00Z',
          items: [
            {
              id: 'it-9',
              itemId: 'it-9',
              dishId: 'recipe-1',
              name: 'Papadzules',
              quantity: 1,
              unitPrice: 100,
              status: 'PENDING',
              modifiers: [],
            },
          ],
        });
      }),
      http.patch('*/orders/ord-conflict-cancel/cancel', async () =>
        HttpResponse.json(
          { error: { code: 'VERSION_CONFLICT', message: 'Concurrent update lost' } },
          { status: 409 },
        ),
      ),
    );

    render(
      <OrderTicketWidget
        orderId="ord-conflict-cancel"
        userId="waiter-4"
        tokenProvider={async () => 'test-token'}
        apiBaseUrl="http://localhost"
      />,
    );

    const cancelBtn = await screen.findByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(getCalls).toBeGreaterThanOrEqual(2);
    });
  });
});
