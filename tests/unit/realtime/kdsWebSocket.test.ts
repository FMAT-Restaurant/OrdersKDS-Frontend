import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  KdsWebSocketClient,
  WS_CLOSE_FORBIDDEN_ROLE,
  WS_CLOSE_UNAUTHENTICATED,
} from '../../../src/shared/realtime/kdsWebSocketClient.ts';
import { WebSocketStatus } from '../../../src/shared/realtime/types.ts';
import { VersionTracker } from '../../../src/shared/realtime/versionTracker.ts';
import { type TokenProvider, UserRole } from '../../../src/shared/types/auth.ts';
import { ItemStatus, OrderStatus } from '../../../src/shared/types/order.ts';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  protocols?: string | string[];
  readyState = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown): void {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent('message', { data: serialized }));
  }

  simulateClose(code: number, reason = ''): void {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

describe('KDS WebSocket Client (UT-FE-25, UT-FE-26, IT-FE-02..05)', () => {
  let tracker: VersionTracker;
  let mockTokenProvider: Mock<TokenProvider>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    tracker = new VersionTracker();
    mockTokenProvider = vi.fn<TokenProvider>().mockResolvedValue('jwt-token-123');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('UT-FE-25: Role to WebSocket Endpoint Resolution', () => {
    it('maps kitchen role to /ws/kds', () => {
      const client = new KdsWebSocketClient({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      });

      expect(client.resolveEndpoint()).toBe('/ws/kds');
      expect(client.resolveFullUrl()).toBe('ws://localhost:8000/ws/kds');
    });

    it('maps chef and admin roles to /ws/kds', () => {
      const chefClient = new KdsWebSocketClient({
        role: UserRole.CHEF,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
      });
      const adminClient = new KdsWebSocketClient({
        role: UserRole.ADMIN,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
      });

      expect(chefClient.resolveEndpoint()).toBe('/ws/kds');
      expect(adminClient.resolveEndpoint()).toBe('/ws/kds');
    });

    it('maps waiter role to /ws/waiter', () => {
      const waiterClient = new KdsWebSocketClient({
        role: UserRole.WAITER,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
      });

      expect(waiterClient.resolveEndpoint()).toBe('/ws/waiter');
      expect(waiterClient.resolveFullUrl()).toBe('ws://localhost:8000/ws/waiter');
    });
  });

  describe('UT-FE-26: Dynamic Station Subscriptions Without Socket Reconnection', () => {
    it('sends subscribe message over existing open socket when station changes', async () => {
      const client = new KdsWebSocketClient({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Station selector changes to plancha
      client.subscribe(['kds:station:plancha']);

      expect(ws.sentMessages).toHaveLength(1);
      expect(JSON.parse(ws.sentMessages[0])).toEqual({
        type: 'subscribe',
        channels: ['kds:station:plancha'],
      });

      // Station selector changes to freidora: socket must NOT reconnect
      client.subscribe(['kds:station:freidora']);

      expect(MockWebSocket.instances).toHaveLength(1); // Same socket instance
      expect(ws.sentMessages).toHaveLength(2);
      expect(JSON.parse(ws.sentMessages[1])).toEqual({
        type: 'subscribe',
        channels: ['kds:station:freidora'],
      });

      client.disconnect();
    });
  });

  describe('IT-FE-02: 4401 Token Expiration Lifecycle', () => {
    it('triggers onTokenExpired, requests new token, reconnects, and calls onReconnectFullRefetch', async () => {
      const onTokenExpired = vi.fn();
      const onReconnectFullRefetch = vi.fn();

      mockTokenProvider
        .mockResolvedValueOnce('expired-token')
        .mockResolvedValueOnce('fresh-token');

      const client = new KdsWebSocketClient({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
        minReconnectDelayMs: 100,
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onTokenExpired,
        onReconnectFullRefetch,
      });

      await client.connect();
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      // Server closes with 4401 UNAUTHENTICATED
      ws1.simulateClose(WS_CLOSE_UNAUTHENTICATED, 'UNAUTHENTICATED');

      expect(onTokenExpired).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe(WebSocketStatus.RECONNECTING);

      // Fast-forward backoff timer
      await vi.advanceTimersByTimeAsync(350);

      expect(MockWebSocket.instances).toHaveLength(2);
      const ws2 = MockWebSocket.instances[1];

      // Second connection succeeds
      ws2.simulateOpen();

      expect(client.getStatus()).toBe(WebSocketStatus.CONNECTED);
      expect(onReconnectFullRefetch).toHaveBeenCalledTimes(1);

      client.disconnect();
    });
  });

  describe('IT-FE-03: 4403 Forbidden Role Handling', () => {
    it('transitions to TERMINATED and does NOT attempt reconnection when 4403 is received', async () => {
      const onForbiddenRole = vi.fn();

      const client = new KdsWebSocketClient({
        role: UserRole.WAITER,
        tokenProvider: mockTokenProvider,
        baseUrl: 'ws://localhost:8000',
        minReconnectDelayMs: 100,
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onForbiddenRole,
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Server closes with 4403 FORBIDDEN_ROLE
      ws.simulateClose(WS_CLOSE_FORBIDDEN_ROLE, 'FORBIDDEN_ROLE');

      expect(onForbiddenRole).toHaveBeenCalledTimes(1);
      expect(client.getStatus()).toBe(WebSocketStatus.TERMINATED);

      // Fast-forward time: no reconnect should happen
      await vi.advanceTimersByTimeAsync(1000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('IT-FE-04: FORBIDDEN_CHANNEL Event Handling', () => {
    it('calls onForbiddenChannel and removes channel without reconnecting socket', async () => {
      const onForbiddenChannel = vi.fn();

      const client = new KdsWebSocketClient({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        initialChannels: ['kds:station:plancha', 'kds:station:restricted'],
        baseUrl: 'ws://localhost:8000',
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onForbiddenChannel,
      });

      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Server sends FORBIDDEN_CHANNEL error frame
      ws.simulateMessage({
        type: 'error',
        code: 'FORBIDDEN_CHANNEL',
        channel: 'kds:station:restricted',
        message: 'No permission for this station',
      });

      expect(onForbiddenChannel).toHaveBeenCalledWith(
        'kds:station:restricted',
        'No permission for this station',
      );
      expect(client.getSubscribedChannels()).toEqual(['kds:station:plancha']);
      expect(MockWebSocket.instances).toHaveLength(1); // No reconnection

      client.disconnect();
    });
  });

  describe('IT-FE-05: Inbound Messages and Monotonic Version Filtering', () => {
    it('processes order.status_changed and item.status_changed, discarding out-of-order versions', async () => {
      const orderListener = vi.fn();
      const itemListener = vi.fn();

      const client = new KdsWebSocketClient(
        {
          role: UserRole.KITCHEN,
          tokenProvider: mockTokenProvider,
          baseUrl: 'ws://localhost:8000',
          WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        },
        tracker,
      );

      client.onOrderStatusChanged(orderListener);
      client.onItemStatusChanged(itemListener);

      await client.connect();
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Seed order-1 with version 2
      tracker.setVersion('order-1', 2);

      // 1. Inbound order.status_changed with version 1 (out-of-order) -> DISCARD
      ws.simulateMessage({
        type: 'order.status_changed',
        orderId: 'order-1',
        status: OrderStatus.IN_PREPARATION,
        version: 1,
      });
      expect(orderListener).not.toHaveBeenCalled();

      // 2. Inbound order.status_changed with version 2 (duplicate) -> DISCARD
      ws.simulateMessage({
        type: 'order.status_changed',
        orderId: 'order-1',
        status: OrderStatus.IN_PREPARATION,
        version: 2,
      });
      expect(orderListener).not.toHaveBeenCalled();

      // 3. Inbound order.status_changed with version 3 -> ACCEPT
      ws.simulateMessage({
        type: 'order.status_changed',
        orderId: 'order-1',
        status: OrderStatus.DELIVERED,
        version: 3,
      });
      expect(orderListener).toHaveBeenCalledTimes(1);
      expect(orderListener).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          status: OrderStatus.DELIVERED,
          version: 3,
        }),
      );

      // 4. Inbound item.status_changed with version 4 -> ACCEPT
      ws.simulateMessage({
        type: 'item.status_changed',
        orderId: 'order-1',
        itemId: 'item-10',
        status: ItemStatus.READY,
        version: 4,
      });
      expect(itemListener).toHaveBeenCalledTimes(1);
      expect(itemListener).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          itemId: 'item-10',
          status: ItemStatus.READY,
          version: 4,
        }),
      );

      // 5. Inbound malformed message -> ignored gracefully
      ws.simulateMessage({ invalid: 'data' });
      expect(orderListener).toHaveBeenCalledTimes(1);
      expect(itemListener).toHaveBeenCalledTimes(1);

      client.disconnect();
    });

    it('handles unsubscribe, error callback, and transient disconnection with backoff', async () => {
      const onError = vi.fn();
      const client = new KdsWebSocketClient({
        role: UserRole.KITCHEN,
        tokenProvider: mockTokenProvider,
        initialChannels: ['kds:station:plancha', 'kds:station:freidora'],
        minReconnectDelayMs: 200,
        WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
        onError,
      });

      await client.connect();
      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      client.unsubscribe(['kds:station:freidora']);
      expect(client.getSubscribedChannels()).toEqual(['kds:station:plancha']);

      // Simulate WS error event
      ws1.onerror?.(new Event('error'));
      expect(onError).toHaveBeenCalledTimes(1);

      // Simulate unexpected network drop (code 1006)
      ws1.simulateClose(1006, 'Abnormal closure');
      expect(client.getStatus()).toBe(WebSocketStatus.RECONNECTING);

      // Advance timers to trigger reconnect
      await vi.advanceTimersByTimeAsync(500);
      expect(MockWebSocket.instances).toHaveLength(2);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      expect(client.getStatus()).toBe(WebSocketStatus.CONNECTED);

      // Manual disconnect
      client.disconnect();
      expect(client.getStatus()).toBe(WebSocketStatus.DISCONNECTED);
    });
  });
});

