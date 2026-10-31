import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ApiClient, apiClient as defaultApiClient } from '../../shared/api/client.ts';
import { KdsQueueResponseSchema, type Order } from '../../shared/api/schemas.ts';
import type { TokenProvider } from '../../shared/types/auth.ts';

export type KdsViewType = 'active' | 'delivered';

export interface UseKdsQueueOptions {
  view?: KdsViewType;
  client?: ApiClient;
  tokenProvider?: TokenProvider;
  enabled?: boolean;
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
}: UseKdsQueueOptions = {}): UseQueryResult<Order[], Error> {
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
      return effectiveClient.get<Order[]>(
        `/kds/queue?view=${view}`,
        KdsQueueResponseSchema,
      );
    },
    enabled,
  });
}

