import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useOrderEvents } from '../../../src/shared/realtime/useOrderEvents.ts';
import { type TokenProvider, UserRole } from '../../../src/shared/types/auth.ts';
import { OrderStatus } from '../../../src/shared/types/order.ts';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1000 }));
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown): void {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent('message', { data: serialized }));
  }

  simulateClose(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

describe('useOrderEvents React Hook Integration', () => {
  let queryClient: QueryClient;
  let mockTokenProvider: Mock<TokenProvider>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries');
    mockTokenProvider = vi.fn<TokenProvider>().mockResolvedValue('test-jwt');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects to WebSocket and invalidates TanStack Query cache on order status change', async () => {
    const onOrderStatusChanged = vi.fn();

    renderHook(() =>
      useOrderEvents({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        channels: ['kds:station:plancha'],
        queryClient,
        baseUrl: 'ws://localhost:8000',
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onOrderStatusChanged,
      }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Simulate order status changed event
    act(() => {
      ws.simulateMessage({
        type: 'order.status_changed',
        orderId: 'order-99',
        status: OrderStatus.IN_PREPARATION,
        version: 1,
      });
    });

    expect(onOrderStatusChanged).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['kds', 'queue'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['order', 'order-99'] });
  });

  it('dynamically subscribes to new channels without reconnecting', async () => {
    const { rerender } = renderHook(
      ({ channels }) =>
        useOrderEvents({
          role: UserRole.KITCHEN,
          tokenProvider: mockTokenProvider,
          channels,
          queryClient,
          baseUrl: 'ws://localhost:8000',
          WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        }),
      { initialProps: { channels: ['kds:station:plancha'] } },
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Rerender with added channel
    rerender({ channels: ['kds:station:freidora'] });

    await waitFor(() => {
      expect(ws.sentMessages.some((msg) => msg.includes('kds:station:freidora'))).toBe(true);
    });

    expect(MockWebSocket.instances).toHaveLength(1); // Same socket
  });

  it('handles item.status_changed, onForbiddenRole, onForbiddenChannel, and exposes subscribe/unsubscribe', async () => {
    const onItemStatusChanged = vi.fn();
    const onForbiddenRole = vi.fn();
    const onForbiddenChannel = vi.fn();

    const { result } = renderHook(() =>
      useOrderEvents({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        channels: ['kds:station:plancha'],
        queryClient,
        baseUrl: 'ws://localhost:8000',
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onItemStatusChanged,
        onForbiddenRole,
        onForbiddenChannel,
      }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Test item.status_changed
    act(() => {
      ws.simulateMessage({
        type: 'item.status_changed',
        orderId: 'ord-item-test',
        itemId: 'item-55',
        status: 'READY',
        version: 1,
      });
    });

    expect(onItemStatusChanged).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['order', 'ord-item-test'] });

    // Test subscribe and unsubscribe callbacks from hook
    act(() => {
      result.current.subscribe(['kds:station:horno']);
    });
    expect(ws.sentMessages.some((msg) => msg.includes('kds:station:horno'))).toBe(true);

    act(() => {
      result.current.unsubscribe(['kds:station:horno']);
    });

    // Test onForbiddenChannel
    act(() => {
      ws.simulateMessage({
        type: 'error',
        code: 'FORBIDDEN_CHANNEL',
        channel: 'kds:station:restricted',
        message: 'No access',
      });
    });
    expect(onForbiddenChannel).toHaveBeenCalledWith('kds:station:restricted', 'No access');

    // Test onForbiddenRole
    act(() => {
      ws.simulateClose(4403, 'FORBIDDEN_ROLE');
    });
    expect(onForbiddenRole).toHaveBeenCalledTimes(1);
  });

  it('triggers full queryClient invalidation on reconnect (onReconnectFullRefetch)', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() =>
        useOrderEvents({
          role: UserRole.KITCHEN,
          tokenProvider: mockTokenProvider,
          channels: ['kds:kitchen'],
          queryClient,
          baseUrl: 'ws://localhost:8000',
          WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        }),
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const ws1 = MockWebSocket.instances[0];
      act(() => {
        ws1.simulateOpen();
      });

      // Trigger unexpected close to initiate reconnection
      act(() => {
        ws1.simulateClose(1006, 'Abnormal closure');
      });

      // Fast forward reconnect timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
      const ws2 = MockWebSocket.instances[1];
      act(() => {
        ws2.simulateOpen();
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

