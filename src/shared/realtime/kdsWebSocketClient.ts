import { UserRole } from '../types/auth.ts';
import { type WsErrorMessage, WsInboundMessageSchema } from './schemas.ts';
import {
  type ItemStatusChangedEvent,
  type KdsWebSocketClientOptions,
  type OrderStatusChangedEvent,
  WebSocketStatus,
} from './types.ts';
import { versionTracker, type VersionTracker } from './versionTracker.ts';

export const WS_CLOSE_UNAUTHENTICATED = 4401;
export const WS_CLOSE_FORBIDDEN_ROLE = 4403;

type EventListener<T> = (event: T) => void;

export class KdsWebSocketClient {
  private ws: WebSocket | null = null;
  private status: WebSocketStatus = WebSocketStatus.DISCONNECTED;
  private readonly options: KdsWebSocketClientOptions;
  private readonly tracker: VersionTracker;
  private readonly WebSocketClass: typeof WebSocket;

  private readonly subscribedChannels = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentReconnectDelay: number;
  private wasReconnecting = false;
  private isManuallyClosed = false;

  private readonly orderStatusListeners = new Set<EventListener<OrderStatusChangedEvent>>();
  private readonly itemStatusListeners = new Set<EventListener<ItemStatusChangedEvent>>();
  private readonly errorListeners = new Set<EventListener<WsErrorMessage>>();

  constructor(
    options: KdsWebSocketClientOptions,
    tracker: VersionTracker = versionTracker,
  ) {
    this.options = options;
    this.tracker = tracker;
    this.WebSocketClass = options.WebSocketClass ?? (typeof WebSocket !== 'undefined' ? WebSocket : (null as unknown as typeof WebSocket));
    this.currentReconnectDelay = options.minReconnectDelayMs ?? 500;

    if (options.initialChannels) {
      options.initialChannels.forEach((c) => this.subscribedChannels.add(c));
    }
  }

  getStatus(): WebSocketStatus {
    return this.status;
  }

  private setStatus(newStatus: WebSocketStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.options.onStatusChange?.(newStatus);
    }
  }

  /**
   * Resolves the WebSocket URL depending on user role:
   * Kitchen roles (kitchen, chef, admin) -> /ws/kds
   * Waiter roles (waiter, admin) -> /ws/waiter
   */
  resolveEndpoint(): string {
    if (this.options.wsPath) {
      return this.options.wsPath;
    }
    const role = this.options.role;
    if (role === UserRole.WAITER) {
      return '/ws/waiter';
    }
    return '/ws/kds';
  }

  resolveFullUrl(): string {
    const path = this.resolveEndpoint();
    if (this.options.baseUrl) {
      const cleanBase = this.options.baseUrl.replace(/\/+$/, '');
      return `${cleanBase}${path}`;
    }
    if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}${path}`;
    }
    return `ws://localhost:8000${path}`;
  }

  /**
   * Initiates connection to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.status === WebSocketStatus.CONNECTED || this.status === WebSocketStatus.CONNECTING) {
      return;
    }

    if (!this.WebSocketClass) {
      console.warn('WebSocket API is not available in the current environment.');
      return;
    }

    this.isManuallyClosed = false;
    this.clearReconnectTimer();
    this.setStatus(this.wasReconnecting ? WebSocketStatus.RECONNECTING : WebSocketStatus.CONNECTING);

    let token: string | null = null;
    try {
      token = await this.options.tokenProvider();
    } catch (err) {
      console.warn('Failed to obtain token for WebSocket connection:', err);
    }

    const url = this.resolveFullUrl();

    try {
      // In browser environment, passing token via subprotocol if available
      this.ws = token ? new this.WebSocketClass(url, ['bearer', token]) : new this.WebSocketClass(url);
    } catch (err) {
      this.handleConnectionError(err);
      return;
    }

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  /**
   * Subscribes to additional channels dynamically without reconnecting the socket.
   */
  subscribe(channels: string[]): void {
    for (const ch of channels) {
      this.subscribedChannels.add(ch);
    }

    if (this.ws?.readyState === WebSocket.OPEN && channels.length > 0) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channels }));
    }
  }

  /**
   * Unsubscribes from stations/channels.
   */
  unsubscribe(channels: string[]): void {
    for (const ch of channels) {
      this.subscribedChannels.delete(ch);
    }
  }

  /**
   * Returns current subscribed channels.
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.subscribedChannels);
  }

  /**
   * Closes connection cleanly and cancels any pending reconnects.
   */
  disconnect(): void {
    this.isManuallyClosed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    this.setStatus(WebSocketStatus.DISCONNECTED);
  }

  onOrderStatusChanged(listener: EventListener<OrderStatusChangedEvent>): () => void {
    this.orderStatusListeners.add(listener);
    return () => this.orderStatusListeners.delete(listener);
  }

  onItemStatusChanged(listener: EventListener<ItemStatusChangedEvent>): () => void {
    this.itemStatusListeners.add(listener);
    return () => this.itemStatusListeners.delete(listener);
  }

  onError(listener: EventListener<WsErrorMessage>): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private handleOpen(): void {
    const wasReconnecting = this.wasReconnecting;
    this.setStatus(WebSocketStatus.CONNECTED);
    this.currentReconnectDelay = this.options.minReconnectDelayMs ?? 500;
    this.wasReconnecting = false;

    // Resubscribe to channels on the newly established connection
    if (this.subscribedChannels.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          channels: Array.from(this.subscribedChannels),
        }),
      );
    }

    // Trigger full query refetch if recovering from reconnection
    if (wasReconnecting) {
      this.options.onReconnectFullRefetch?.();
    }
  }

  private handleMessage(event: MessageEvent): void {
    let rawData: unknown;
    try {
      rawData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      // Ignore unparseable raw frame
      return;
    }

    const result = WsInboundMessageSchema.safeParse(rawData);
    if (!result.success) {
      console.warn('Received invalid WebSocket message schema:', result.error.issues);
      return;
    }

    const message = result.data;

    switch (message.type) {
      case 'error': {
        if (message.code === 'FORBIDDEN_CHANNEL') {
          if (message.channel) {
            this.subscribedChannels.delete(message.channel);
          }
          this.options.onForbiddenChannel?.(message.channel ?? '', message.message);
        }
        this.errorListeners.forEach((l) => l(message));
        break;
      }

      case 'order.status_changed': {
        // Monotonic version check (RNF-09)
        if (!this.tracker.shouldApply(message.orderId, message.version)) {
          // Drop stale/out-of-order event
          return;
        }
        this.orderStatusListeners.forEach((l) => l(message));
        break;
      }

      case 'item.status_changed': {
        // Monotonic version check (RNF-09)
        if (!this.tracker.shouldApply(message.orderId, message.version)) {
          // Drop stale/out-of-order event
          return;
        }
        this.itemStatusListeners.forEach((l) => l(message));
        break;
      }
    }
  }

  private handleClose(event: CloseEvent): void {
    this.ws = null;

    if (this.isManuallyClosed) {
      this.setStatus(WebSocketStatus.DISCONNECTED);
      return;
    }

    // Close code 4403: Forbidden role -> Terminate without retry (DoD #5)
    if (event.code === WS_CLOSE_FORBIDDEN_ROLE) {
      this.setStatus(WebSocketStatus.TERMINATED);
      this.options.onForbiddenRole?.();
      return;
    }

    // Close code 4401: Unauthenticated / expired token -> refresh token and reconnect
    if (event.code === WS_CLOSE_UNAUTHENTICATED) {
      this.wasReconnecting = true;
      this.options.onTokenExpired?.();
      this.scheduleReconnect();
      return;
    }

    // Transient network drop / other closure -> schedule backoff reconnect
    this.wasReconnecting = true;
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    const error = new Error(`WebSocket error event: ${event.type}`);
    this.options.onError?.(error);
  }

  private handleConnectionError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.options.onError?.(error);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.isManuallyClosed || this.status === WebSocketStatus.TERMINATED) {
      return;
    }

    this.setStatus(WebSocketStatus.RECONNECTING);
    this.clearReconnectTimer();

    const maxDelay = this.options.maxReconnectDelayMs ?? 10000;
    const factor = this.options.backoffFactor ?? 1.5;

    // Add 0-200ms jitter using crypto to prevent CWE-338 security hotspot
    const randomByte = typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(1))[0]
      : 0;
    const jitter = randomByte % 200;
    const delay = Math.min(this.currentReconnectDelay + jitter, maxDelay);

    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);

    // Compute next delay for exponential backoff
    this.currentReconnectDelay = Math.min(this.currentReconnectDelay * factor, maxDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
