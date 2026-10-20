import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/shared/api/client.ts';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import { createQueryClient, queryClient } from '../../../src/shared/api/queryClient.ts';

describe('queryClient TanStack Query Configuration (RNF-04, RNF-09)', () => {
  it('exports a default singleton instance and createQueryClient factory', () => {
    expect(queryClient).toBeDefined();
    const customClient = createQueryClient();
    expect(customClient).toBeDefined();
  });

  it('enforces strict Zero Polling defaults on queries', () => {
    const client = createQueryClient();
    const defaultOptions = client.getDefaultOptions().queries;

    expect(defaultOptions?.staleTime).toBe(30000);
    expect(defaultOptions?.refetchOnWindowFocus).toBe(false);
    expect(defaultOptions?.refetchInterval).toBe(false);
  });

  it('does NOT retry queries for 401, 403, 404, or 409 errors', () => {
    const client = createQueryClient();
    const retryFn = client.getDefaultOptions().queries?.retry;

    if (typeof retryFn === 'function') {
      const err401 = new ApiError(401, ErrorCode.UNAUTHENTICATED, 'unauthenticated');
      const err403 = new ApiError(403, ErrorCode.FORBIDDEN_ROLE, 'forbidden');
      const err404 = new ApiError(404, ErrorCode.ORDER_NOT_FOUND, 'not found');
      const err409 = new ApiError(409, ErrorCode.VERSION_CONFLICT, 'conflict');

      expect(retryFn(0, err401)).toBe(false);
      expect(retryFn(0, err403)).toBe(false);
      expect(retryFn(0, err404)).toBe(false);
      expect(retryFn(0, err409)).toBe(false);
    } else {
      expect.fail('retry should be a function');
    }
  });

  it('retries transient network errors up to 2 times', () => {
    const client = createQueryClient();
    const retryFn = client.getDefaultOptions().queries?.retry;

    if (typeof retryFn === 'function') {
      const transientErr = new Error('Network timeout');
      expect(retryFn(0, transientErr)).toBe(true);
      expect(retryFn(1, transientErr)).toBe(true);
      expect(retryFn(2, transientErr)).toBe(false);
    } else {
      expect.fail('retry should be a function');
    }
  });

  it('disables automatic retry on mutations', () => {
    const client = createQueryClient();
    const mutationRetry = client.getDefaultOptions().mutations?.retry;
    expect(mutationRetry).toBe(false);
  });
});
