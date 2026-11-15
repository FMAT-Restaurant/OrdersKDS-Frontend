import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { resolveApiClient, type ApiClient } from '../../shared/api/client.ts';
import { toDeveloperEndpointError } from '../../shared/api/devErrorLogger.ts';
import { KdsQueueResponseSchema, type Order } from '../../shared/api/schemas.ts';
import type { TokenProvider } from '../../shared/types/auth.ts';

export type KdsViewType = 'active' | 'delivered';
export type KdsTabType = 'pending' | 'in_preparation' | 'active' | 'redo' | 'delivered' | 'expired';

export interface UseKdsQueueOptions {
  readonly view?: KdsViewType;
  readonly client?: ApiClient;
  readonly apiBaseUrl?: string;
  readonly tokenProvider?: TokenProvider;
  readonly enabled?: boolean;
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
  apiBaseUrl,
  tokenProvider,
  enabled = true,
}: Readonly<UseKdsQueueOptions> = {}): UseQueryResult<Order[], Error> {
  const effectiveClient = useMemo(
    () => resolveApiClient({ client, baseUrl: apiBaseUrl, tokenProvider }),
    [client, apiBaseUrl, tokenProvider],
  );

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
          throw toDeveloperEndpointError('KDS', `/kds/queue?view=${view}`, err);
        }
        throw err;
      }
    },
    enabled,
  });
}
