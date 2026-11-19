import { http, HttpResponse } from 'msw';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { mockDeliveredQueue, mockKdsQueue, mockOrder1 } from '../fixtures/orderFixtures.ts';

export const restHandlers = [
  // GET /kds/queue
  http.get('*/kds/queue', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
          },
        },
        { status: 401 },
      );
    }

    if (authHeader.includes('forbidden-role')) {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.FORBIDDEN_ROLE,
            message: 'Role not allowed.',
          },
        },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const view = url.searchParams.get('view');
    if (view === 'delivered') {
      return HttpResponse.json(mockDeliveredQueue);
    }

    return HttpResponse.json(mockKdsQueue);
  }),

  // GET /orders (shift order list)
  http.get('*/orders', () => HttpResponse.json([])),

  // GET /orders/:orderId
  http.get('*/orders/:orderId', ({ params }) => {
    const { orderId } = params;
    const found = mockKdsQueue.find((o) => o.id === orderId || o.orderId === orderId);
    if (!found) {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.ORDER_NOT_FOUND,
            message: 'Order not found.',
          },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json(found);
  }),

  // PATCH /orders/:orderId/ready
  http.patch('*/orders/:orderId/ready', ({ params, request }) => {
    const { orderId } = params;
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Authentication required.',
          },
        },
        { status: 401 },
      );
    }

    if (authHeader.includes('forbidden-role')) {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.FORBIDDEN_ROLE,
            message: 'Role not allowed.',
          },
        },
        { status: 403 },
      );
    }

    if (orderId === 'conflict-order') {
      return HttpResponse.json(
        {
          error: {
            code: ErrorCode.VERSION_CONFLICT,
            message: 'Stale version detected.',
          },
        },
        { status: 409 },
      );
    }

    return HttpResponse.json({
      ...mockOrder1,
      id: String(orderId),
      orderId: String(orderId),
      status: 'DELIVERED',
      version: mockOrder1.version + 1,
    });
  }),

  // GET /shifts/current
  http.get('*/shifts/current', () =>
    HttpResponse.json({
      isOpen: true,
      canAcceptOrders: true,
      currentShift: {
        id: 'shift-1',
        shiftId: 'shift-1',
        shiftNumber: 1,
        status: 'OPEN',
        lastOrderFolio: 2,
        openedAt: '2026-11-19T08:00:00Z',
        version: 1,
      },
      lastClosedShift: null,
      nextShiftNumber: 2,
    }),
  ),

  // POST /shifts/open
  http.post('*/shifts/open', () =>
    HttpResponse.json(
      {
        id: 'shift-2',
        shiftId: 'shift-2',
        shiftNumber: 2,
        status: 'OPEN',
        lastOrderFolio: 0,
        openedAt: '2026-11-19T14:00:00Z',
        version: 1,
      },
      { status: 201 },
    ),
  ),

  // POST /shifts/current/close
  http.post('*/shifts/current/close', () =>
    HttpResponse.json({
      id: 'shift-1',
      shiftId: 'shift-1',
      shiftNumber: 1,
      status: 'CLOSED',
      lastOrderFolio: 2,
      openedAt: '2026-11-19T08:00:00Z',
      closedAt: '2026-11-19T14:00:00Z',
      version: 2,
    }),
  ),
];
