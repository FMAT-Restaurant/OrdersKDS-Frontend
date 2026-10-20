import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { queryClient as defaultQueryClient } from '../api/queryClient.ts';
import type { TokenProvider, UserRole } from '../types/auth.ts';
import { KdsWebSocketClient } from './kdsWebSocketClient.ts';
import {
  type ItemStatusChangedEvent,
  type OrderStatusChangedEvent,
  WebSocketStatus,
} from './types.ts';

export interface UseOrderEventsOptions {
  role: UserRole;
  tokenProvider: TokenProvider;
  channels?: string[];
  queryClient?: QueryClient;
  baseUrl?: string;
  onOrderStatusChanged?: (event: OrderStatusChangedEvent) => void;
  onItemStatusChanged?: (event: ItemStatusChangedEvent) => void;
  onForbiddenRole?: () => void;
  onForbiddenChannel?: (channel: string, message?: string) => void;
  WebSocketClass?: typeof WebSocket;
}

export function useOrderEvents({
  role,
  tokenProvider,
  channels = [],
  queryClient = defaultQueryClient,
  baseUrl,
  onOrderStatusChanged,
  onItemStatusChanged,
  onForbiddenRole,
  onForbiddenChannel,
  WebSocketClass,
}: UseOrderEventsOptions) {
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.DISCONNECTED);
  const [client, setClient] = useState<KdsWebSocketClient | null>(null);
  const clientRef = useRef<KdsWebSocketClient | null>(null);

  // References to keep latest callbacks without recreating socket
  const callbacksRef = useRef({
    onOrderStatusChanged,
    onItemStatusChanged,
    onForbiddenRole,
    onForbiddenChannel,
  });

  useEffect(() => {
    callbacksRef.current = {
      onOrderStatusChanged,
      onItemStatusChanged,
      onForbiddenRole,
      onForbiddenChannel,
    };
  });

  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    const wsClient = new KdsWebSocketClient({
      role,
      tokenProvider,
      baseUrl,
      WebSocketClass,
      initialChannels: channelsRef.current,
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
      onReconnectFullRefetch: () => {
        // Full invalidation after reconnection or 4401 token refresh (DoD #5)
        queryClient.invalidateQueries();
      },
      onForbiddenRole: () => {
        callbacksRef.current.onForbiddenRole?.();
      },
      onForbiddenChannel: (channel, message) => {
        callbacksRef.current.onForbiddenChannel?.(channel, message);
      },
    });

    clientRef.current = wsClient;
    setClient(wsClient);

    const unsubOrder = wsClient.onOrderStatusChanged((event) => {
      // Invalidate target order queries
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['kds', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['order', event.orderId] });
      callbacksRef.current.onOrderStatusChanged?.(event);
    });

    const unsubItem = wsClient.onItemStatusChanged((event) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['kds', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['order', event.orderId] });
      callbacksRef.current.onItemStatusChanged?.(event);
    });

    void wsClient.connect();

    return () => {
      unsubOrder();
      unsubItem();
      wsClient.disconnect();
      clientRef.current = null;
      setClient(null);
    };
  }, [role, tokenProvider, baseUrl, queryClient, WebSocketClass]);

  // Dynamic station channel change without reconnecting socket (OP-02, DoD #5)
  useEffect(() => {
    if (client && channels.length > 0) {
      client.subscribe(channels);
    }
  }, [client, channels]);

  const subscribe = useCallback((newChannels: string[]) => {
    clientRef.current?.subscribe(newChannels);
  }, []);

  const unsubscribe = useCallback((removeChannels: string[]) => {
    clientRef.current?.unsubscribe(removeChannels);
  }, []);

  return {
    status,
    client,
    subscribe,
    unsubscribe,
  };
}
