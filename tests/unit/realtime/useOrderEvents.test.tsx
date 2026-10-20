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
});
