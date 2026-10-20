import { http, HttpResponse } from 'msw';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { mockKdsQueue, mockOrder1 } from '../fixtures/orderFixtures.ts';

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

    return HttpResponse.json(mockKdsQueue);
  }),

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
];
