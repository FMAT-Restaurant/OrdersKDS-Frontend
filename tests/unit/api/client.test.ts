import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../../../src/shared/api/client.ts';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { KdsQueueResponseSchema, OrderSchema } from '../../../src/shared/api/schemas.ts';
import { OrderStatus } from '../../../src/shared/types/order.ts';
import { server } from '../../mocks/server.ts';

describe('UT-FE-15 & UT-FE-16: ApiClient REST Client', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  describe('UT-FE-15: TokenProvider JWT Injection', () => {
    it('injects Authorization: Bearer token from TokenProvider callback', async () => {
      const mockTokenProvider = vi.fn().mockResolvedValue('valid-test-token');
      const client = new ApiClient({
        tokenProvider: mockTokenProvider,
      });

      const queue = await client.get('/kds/queue', KdsQueueResponseSchema);
      expect(mockTokenProvider).toHaveBeenCalledTimes(1);
      expect(Array.isArray(queue)).toBe(true);
      expect(queue.length).toBeGreaterThan(0);
    });

    it('does not read from localStorage or sessionStorage for auth tokens', async () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const mockTokenProvider = vi.fn().mockResolvedValue('isolated-token');
      const client = new ApiClient({ tokenProvider: mockTokenProvider });

      await client.get('/kds/queue', KdsQueueResponseSchema);
      const authCalls = getItemSpy.mock.calls.filter(([key]) => /token|jwt|auth/i.test(key));
      expect(authCalls).toHaveLength(0);
      getItemSpy.mockRestore();
    });
  });

  describe('UT-FE-16: Error Mapping and Boundary Validation', () => {
    it('maps 401 UNAUTHENTICATED to ApiError with friendly Spanish message', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue(null), // triggers 401
      });

      await expect(client.get('/kds/queue', KdsQueueResponseSchema)).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(401);
          expect(apiErr.code).toBe(ErrorCode.UNAUTHENTICATED);
          expect(apiErr.message).toBe(
            'Su sesión ha expirado o no es válida. Por favor inicie sesión nuevamente.',
          );
          return true;
        },
      );
    });

    it('maps 403 FORBIDDEN_ROLE to ApiError with friendly Spanish message', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('forbidden-role-token'),
      });

      await expect(client.get('/kds/queue', KdsQueueResponseSchema)).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(403);
          expect(apiErr.code).toBe(ErrorCode.FORBIDDEN_ROLE);
          expect(apiErr.message).toBe(
            'No tiene los permisos necesarios para realizar esta acción.',
          );
          return true;
        },
      );
    });

    it('maps 409 VERSION_CONFLICT to ApiError with friendly Spanish message', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('valid-token'),
      });

      await expect(client.patch('/orders/conflict-order/ready', {}, OrderSchema)).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(409);
          expect(apiErr.code).toBe(ErrorCode.VERSION_CONFLICT);
          expect(apiErr.message).toBe(
            'La comanda fue actualizada por otro usuario. Se han recargado los datos más recientes.',
          );
          return true;
        },
      );
    });

    it('fetches single order by id via GET /orders/:orderId', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('valid-token'),
      });

      const order = await client.get('/orders/ord-101', OrderSchema);
      expect(order.id).toBe('ord-101');
      expect(order.status).toBe(OrderStatus.IN_PREPARATION);
    });

    it('handles 404 ORDER_NOT_FOUND when order does not exist in mock handler', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('valid-token'),
      });

      await expect(client.get('/orders/non-existent-order', OrderSchema)).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(404);
          expect(apiErr.code).toBe(ErrorCode.ORDER_NOT_FOUND);
          return true;
        },
      );
    });

    it('successfully transitions order to ready via PATCH /orders/:orderId/ready', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('valid-token'),
      });

      const updated = await client.patch('/orders/ord-101/ready', {}, OrderSchema);
      expect(updated.id).toBe('ord-101');
      expect(updated.status).toBe(OrderStatus.DELIVERED);
    });

    it('returns 401 on PATCH /orders/:orderId/ready when unauthenticated', async () => {
      const client = new ApiClient();

      await expect(client.patch('/orders/ord-101/ready', {})).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.code).toBe(ErrorCode.UNAUTHENTICATED);
        return true;
      });
    });

    it('returns 403 on PATCH /orders/:orderId/ready when role is forbidden', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('forbidden-role-token'),
      });

      await expect(client.patch('/orders/ord-101/ready', {})).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe(ErrorCode.FORBIDDEN_ROLE);
        return true;
      });
    });

    it('throws ApiError with VALIDATION_ERROR when server response violates Zod schema', async () => {
      const client = new ApiClient({
        tokenProvider: vi.fn().mockResolvedValue('valid-token'),
      });

      // Pass single OrderSchema expecting an object, but /kds/queue returns an array
      await expect(client.get('/kds/queue', OrderSchema)).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(apiErr.message).toBe('Los datos enviados no son válidos.');
          return true;
        },
      );
    });

    it('handles 204 No Content responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204, statusText: 'No Content' }),
      );
      const client = new ApiClient({ fetchFn: mockFetch });
      const result = await client.delete('/orders/123');
      expect(result).toBeUndefined();
    });

    it('wraps network fetch failure in ApiError with NETWORK_ERROR message', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      const client = new ApiClient({ fetchFn: mockFetch });

      await expect(client.get('/test')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(apiErr.message).toBe('Error de comunicación con el servidor. Verifique su conexión.');
        return true;
      });
    });

    it('executes post and put requests sending JSON body and resolving full url', async () => {
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, method: options?.method }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });
      const client = new ApiClient({ baseUrl: 'http://localhost:8000/api', fetchFn: mockFetch });

      const postRes = await client.post<{ ok: boolean; method: string }>('/test', { hello: 'world' });
      expect(postRes.method).toBe('POST');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/test',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ hello: 'world' }) }),
      );

      const putRes = await client.put<{ ok: boolean; method: string }>('http://custom-url.com/put', { key: 'val' });
      expect(putRes.method).toBe('PUT');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-url.com/put',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('continues request without Authorization header when tokenProvider throws', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const mockTokenProvider = vi.fn().mockRejectedValue(new Error('Auth Shell unreachable'));
      const client = new ApiClient({ tokenProvider: mockTokenProvider, fetchFn: mockFetch });

      const res = await client.get<{ success: boolean }>('/unauthed');
      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('throws ApiError with VALIDATION_ERROR when 200 response body is invalid JSON', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('<html>Bad Gateway</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );
      const client = new ApiClient({ fetchFn: mockFetch });

      await expect(client.get('/invalid-json')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe(ErrorCode.VALIDATION_ERROR);
        return true;
      });
    });

    it('returns raw data when no validation schema is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ any: 'payload' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const client = new ApiClient({ fetchFn: mockFetch });
      const data = await client.get<{ any: string }>('/raw');
      expect(data.any).toBe('payload');
    });

    it('correctly maps 400, 401, 403, 404, 409, 422, and 500 error fallbacks without JSON body', async () => {
      const testCases = [
        { status: 400, expectedCode: ErrorCode.VALIDATION_ERROR },
        { status: 401, expectedCode: ErrorCode.UNAUTHENTICATED },
        { status: 403, expectedCode: ErrorCode.FORBIDDEN_ROLE },
        { status: 404, expectedCode: ErrorCode.ORDER_NOT_FOUND },
        { status: 409, expectedCode: ErrorCode.VERSION_CONFLICT },
        { status: 422, expectedCode: ErrorCode.VALIDATION_ERROR },
        { status: 500, expectedCode: ErrorCode.INTERNAL_ERROR },
      ];

      for (const tc of testCases) {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response('Plain text error', {
            status: tc.status,
            headers: { 'Content-Type': 'text/plain' },
          }),
        );
        const client = new ApiClient({ fetchFn: mockFetch });

        await expect(client.get('/error')).rejects.toSatisfy((err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(tc.status);
          expect(apiErr.code).toBe(tc.expectedCode);
          return true;
        });
      }
    });

    it('correctly maps custom known error codes in JSON response body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: ErrorCode.DISH_UNAVAILABLE,
              message: 'Dish sold out.',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      const client = new ApiClient({ fetchFn: mockFetch });

      await expect(client.get('/dish-check')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe(ErrorCode.DISH_UNAVAILABLE);
        expect(apiErr.message).toBe('El platillo seleccionado ya no se encuentra disponible.');
        return true;
      });
    });
  });
});
