import { z } from 'zod';
import { ItemStatusSchema, OrderStatusSchema } from '../api/schemas.ts';

/**
 * Outbound subscription message sent from client to server to subscribe to stations/channels.
 * Handled dynamically on the same socket without reconnection.
 */
export const WsSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  channels: z.array(z.string().min(1)),
});

export type WsSubscribeMessage = z.infer<typeof WsSubscribeMessageSchema>;

/**
 * Inbound order status changed event.
 */
export const WsOrderStatusChangedSchema = z.object({
  type: z.literal('order.status_changed'),
  orderId: z.string().min(1),
  status: OrderStatusSchema,
  version: z.number().int().nonnegative(),
  responsibleWaiterId: z.string().min(1).optional(),
  timestamp: z.string().optional(),
  rejectionDetails: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type WsOrderStatusChanged = z.infer<typeof WsOrderStatusChangedSchema>;

/**
 * Inbound item status changed event.
 */
export const WsItemStatusChangedSchema = z.object({
  type: z.literal('item.status_changed'),
  orderId: z.string().min(1),
  itemId: z.string().min(1),
  status: ItemStatusSchema,
  version: z.number().int().nonnegative(),
  timestamp: z.string().optional(),
});

export type WsItemStatusChanged = z.infer<typeof WsItemStatusChangedSchema>;

/**
 * Inbound error message (e.g. FORBIDDEN_CHANNEL).
 */
export const WsErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  channel: z.string().optional(),
  error: z.string().optional(),
});

export type WsErrorMessage = z.infer<typeof WsErrorMessageSchema>;

/**
 * Discriminated union of all supported inbound WebSocket messages.
 * Preprocessed so raw error envelopes like {"error": "FORBIDDEN_CHANNEL"} without discriminator
 * are normalized into a valid WsErrorMessage.
 */
export const WsInboundMessageSchema = z.preprocess((val) => {
  if (val && typeof val === 'object' && 'error' in val && !('type' in val)) {
    const rawError = (val as Record<string, unknown>).error;
    const errCode = typeof rawError === 'string' ? rawError : 'ERROR';
    const msg =
      typeof (val as Record<string, unknown>).message === 'string'
        ? (val as Record<string, unknown>).message
        : errCode;
    return {
      type: 'error',
      code: errCode,
      message: msg,
      error: errCode,
      channel: (val as Record<string, unknown>).channel,
    };
  }
  return val;
}, z.discriminatedUnion('type', [
  WsOrderStatusChangedSchema,
  WsItemStatusChangedSchema,
  WsErrorMessageSchema,
]));

export type WsInboundMessage = z.infer<typeof WsInboundMessageSchema>;
