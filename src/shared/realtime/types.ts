import type { TokenProvider, UserRole } from '../types/auth.ts';
import type { ItemStatus, OrderStatus } from '../types/order.ts';
import type { WsErrorMessage } from './schemas.ts';

/**
 * Connection states for the WebSocket client.
 * Uses `const + as const + type` pattern for `erasableSyntaxOnly: true`.
 */
export const WebSocketStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  TERMINATED: 'TERMINATED',
} as const;

export type WebSocketStatus = typeof WebSocketStatus[keyof typeof WebSocketStatus];

export interface OrderStatusChangedEvent {
  type: 'order.status_changed';
  orderId: string;
  status: OrderStatus;
  version: number;
  timestamp?: string;
}

export interface ItemStatusChangedEvent {
  type: 'item.status_changed';
  orderId: string;
  itemId: string;
  status: ItemStatus;
  version: number;
  timestamp?: string;
}

export type RealtimeMessage =
  | OrderStatusChangedEvent
  | ItemStatusChangedEvent
  | WsErrorMessage;

export interface KdsWebSocketClientOptions {
  /** Base WebSocket URL, e.g. ws://localhost:8000 or wss://api.domain.com. Defaults to window.location host. */
  baseUrl?: string;
  /** Explicit WS path override if needed. Defaults to role-based (/ws/kds or /ws/waiter). */
  wsPath?: string;
  role: UserRole;
  tokenProvider: TokenProvider;
  initialChannels?: string[];
  onStatusChange?: (status: WebSocketStatus) => void;
  onTokenExpired?: () => void;
  onForbiddenRole?: () => void;
  onForbiddenChannel?: (channel: string, message?: string) => void;
  onReconnectFullRefetch?: () => void;
  onError?: (error: Error) => void;
  minReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  backoffFactor?: number;
  WebSocketClass?: typeof WebSocket;
}
