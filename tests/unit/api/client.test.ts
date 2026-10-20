import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../../../src/shared/api/client.ts';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { KdsQueueResponseSchema, OrderSchema } from '../../../src/shared/api/schemas.ts';
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
  });
});
