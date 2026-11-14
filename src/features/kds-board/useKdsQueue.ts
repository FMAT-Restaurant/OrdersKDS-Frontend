import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ApiClient, ApiError, apiClient as defaultApiClient } from '../../shared/api/client.ts';
import { KdsQueueResponseSchema, type Order } from '../../shared/api/schemas.ts';
import type { TokenProvider } from '../../shared/types/auth.ts';

export type KdsViewType = 'active' | 'delivered';
export type KdsTabType = 'pending' | 'in_preparation' | 'active' | 'redo' | 'delivered' | 'expired';

export interface UseKdsQueueOptions {
  readonly view?: KdsViewType;
  readonly client?: ApiClient;
  readonly tokenProvider?: TokenProvider;
  readonly enabled?: boolean;
}

/**
 * In development mode, enriches queue fetch failures so developers get an
 * explicit server connection diagnostic without changing the user-facing alert.
 */
function toDeveloperQueueError(err: unknown, view: KdsViewType): Error {
  const detail = err instanceof Error ? err.message : String(err);
  const endpoint = `/kds/queue?view=${view}`;
  if (err instanceof ApiError) {
    const devMessage = `Error de conexión con el servidor al cargar ${endpoint} (status ${err.status}, code ${err.code}): ${detail}`;
    return new ApiError(err.status, err.code, devMessage, err.details ?? err);
  }
  return new Error(
    `Error de conexión con el servidor al cargar ${endpoint}: ${detail}`,
    { cause: err },
  );
}

/**
 * Hook to consume the KDS queue endpoint (`GET /kds/queue?view=...`).
 *
 * Requirements:
 * - Binds selected view tab to query parameter `view='active'` | `view='delivered'`.
 * - Employs TanStack Query for cache invalidation and zero-polling real-time integration.
 */
export function useKdsQueue({
  view = 'active',
  client,
  tokenProvider,
  enabled = true,
}: Readonly<UseKdsQueueOptions> = {}): UseQueryResult<Order[], Error> {
  const effectiveClient = useMemo(() => {
    if (client) {
      return client;
    }
    if (tokenProvider) {
      return new ApiClient({ tokenProvider });
    }
    return defaultApiClient;
  }, [client, tokenProvider]);

  return useQuery<Order[], Error>({
    queryKey: ['kds', 'queue', view],
    queryFn: async () => {
      try {
        return await effectiveClient.get<Order[]>(
          `/kds/queue?view=${view}`,
          KdsQueueResponseSchema,
        );
      } catch (err) {
        if (import.meta.env.DEV) {
          throw toDeveloperQueueError(err, view);
        }
        throw err;
      }
    },
    enabled,
  });
}
