import { UserRole } from '../types/auth.ts';
import { type WsErrorMessage, WsInboundMessageSchema } from './schemas.ts';
import {
  type ItemStatusChangedEvent,
  type KdsWebSocketClientOptions,
  type OrderStatusChangedEvent,
  WebSocketStatus,
} from './types.ts';
import { versionTracker, type VersionTracker } from './versionTracker.ts';
import { logDeveloperWebSocketClose } from '../api/devErrorLogger.ts';

export const WS_CLOSE_UNAUTHENTICATED = 4401;
export const WS_CLOSE_FORBIDDEN_ROLE = 4403;

const SAFE_ENDPOINT_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const SAFE_HOSTNAME_LABEL_RE = /^[A-Za-z0-9-]+$/;
const SAFE_IPV6_HOST_RE = /^\[[0-9a-fA-F:]+\]$/;
const SAFE_BEARER_TOKEN_RE = /^[A-Za-z0-9._-]+={0,2}$/;
const MAX_TOKEN_LENGTH = 8192;

function sanitizeWsToken(rawToken?: string | null): string | null {
  if (typeof rawToken !== 'string') {
    return null;
  }
  const trimmed = rawToken.trim();
  if (!trimmed || trimmed.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const match = SAFE_BEARER_TOKEN_RE.exec(trimmed);
  return match ? match[0] : null;
}

function sanitizeWsPath(rawPath: string): string {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('..')) {
    throw new Error('Invalid WebSocket endpoint path');
  }
  const segments = rawPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => !SAFE_ENDPOINT_SEGMENT_RE.test(segment))) {
    throw new Error('Invalid WebSocket endpoint path');
  }
  return `/${segments.join('/')}`;
}

function isValidHostname(hostname: string): boolean {
  if (!hostname) {
    return false;
  }
  if (hostname.startsWith('[')) {
    return SAFE_IPV6_HOST_RE.test(hostname);
  }
  return hostname
    .split('.')
    .every((label) => label.length > 0 && SAFE_HOSTNAME_LABEL_RE.test(label));
}

function parseSafeWsPort(rawPort: string): string {
  if (!rawPort) {
    return '';
  }
  const portNum = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535 || String(portNum) !== rawPort) {
    throw new Error('Invalid WebSocket port');
  }
  return `:${portNum}`;
}

function buildValidatedWsUrl(rawBase: string, safeEndpoint: string): URL {
  const parsed = new URL(rawBase);
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Unsupported WebSocket protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('WebSocket URL must not contain embedded credentials');
  }
  if (!isValidHostname(parsed.hostname)) {
    throw new Error('Invalid WebSocket hostname');
  }

  const safeProtocol = parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
  const portSuffix = parseSafeWsPort(parsed.port);
  const basePath = parsed.pathname && parsed.pathname !== '/' ? sanitizeWsPath(parsed.pathname) : '';

  const target = new URL(`${safeProtocol}//${parsed.hostname}${portSuffix}`);
  target.pathname = `${basePath}${safeEndpoint}`;
  parsed.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  if (target.protocol !== safeProtocol || target.hostname !== parsed.hostname) {
    throw new Error('WebSocket URL failed origin integrity check');
  }
  return target;
}

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
    let wsClass: typeof WebSocket | null = null;
    if (options.WebSocketClass !== undefined) {
      wsClass = options.WebSocketClass;
    } else if (typeof WebSocket !== 'undefined') {
      wsClass = WebSocket;
    }
    this.WebSocketClass = wsClass as typeof WebSocket;
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
      return sanitizeWsPath(this.options.wsPath);
    }
    return this.options.role === UserRole.WAITER ? '/ws/waiter' : '/ws/kds';
  }

  private resolveRawBaseUrl(): string {
    if (this.options.baseUrl) {
      return this.options.baseUrl;
    }
    if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}`;
    }
    return 'ws://localhost:8000';
  }

  resolveFullUrl(token?: string | null): string {
    const endpoint = this.resolveEndpoint();
    const targetUrl = buildValidatedWsUrl(this.resolveRawBaseUrl(), endpoint);
    const safeToken = sanitizeWsToken(token);

    if (safeToken) {
      targetUrl.searchParams.set('token', safeToken);
    }
    return targetUrl.toString();
  }

  private openSocket(
    WebSocketCtor: typeof WebSocket,
    safeUrl: string,
    safeToken: string | null,
  ): WebSocket {
    if (!safeToken) {
      return new WebSocketCtor(safeUrl);
    }
    try {
      // Passing token via query param AND subprotocol for maximum resilience across browsers/proxies
      return new WebSocketCtor(safeUrl, ['bearer', safeToken]);
    } catch {
      return new WebSocketCtor(safeUrl);
    }
  }

  /**
   * Initiates connection to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.status === WebSocketStatus.CONNECTED || this.status === WebSocketStatus.CONNECTING) {
      return;
    }

    const WebSocketCtor = this.WebSocketClass;
    if (!WebSocketCtor) {
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

    const safeToken = sanitizeWsToken(token);

    try {
      const safeUrl = this.resolveFullUrl(safeToken);
      this.ws = this.openSocket(WebSocketCtor, safeUrl, safeToken);
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
      logDeveloperWebSocketClose(this.resolveEndpoint(), event.code, this.wasReconnecting);
      this.setStatus(WebSocketStatus.TERMINATED);
      this.options.onForbiddenRole?.();
      return;
    }

    // Close code 4401: Unauthenticated / expired token -> refresh token and reconnect
    if (event.code === WS_CLOSE_UNAUTHENTICATED) {
      logDeveloperWebSocketClose(this.resolveEndpoint(), event.code, this.wasReconnecting);
      this.wasReconnecting = true;
      this.options.onTokenExpired?.();
      this.scheduleReconnect();
      return;
    }

    // Transient network drop / other closure -> schedule backoff reconnect
    logDeveloperWebSocketClose(this.resolveEndpoint(), event.code, this.wasReconnecting);
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
      this.connect().catch(() => undefined);
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
