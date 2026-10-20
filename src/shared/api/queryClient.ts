import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client.ts';
import { ErrorCode } from './errorCodes.ts';

/**
 * Creates and configures a TanStack Query Client following RNF-04 (Zero Polling)
 * and RNF-09 (Optimistic concurrency).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30 seconds
        gcTime: 1000 * 60 * 5, // 5 minutes cache retention
        refetchOnWindowFocus: false, // Strict zero polling: rely on WebSocket events
        refetchInterval: false, // Strict zero polling: no interval polling
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // Do not retry on client auth errors, not found, or version conflicts
            if (
              error.status === 401 ||
              error.status === 403 ||
              error.status === 404 ||
              error.status === 409 ||
              error.code === ErrorCode.UNAUTHENTICATED ||
              error.code === ErrorCode.FORBIDDEN_ROLE ||
              error.code === ErrorCode.ORDER_NOT_FOUND ||
              error.code === ErrorCode.VERSION_CONFLICT
            ) {
              return false;
            }
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
