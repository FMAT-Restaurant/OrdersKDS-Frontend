import { z } from 'zod';
import { ItemStatus, OrderStatus } from '../types/order.ts';

/**
 * Standard API error response schema according to backend RFC (app/api/schemas/errors.py).
 * Requirements: RNF-03, RNF-13.
 */
export const ApiErrorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.unknown().optional(),
});

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorBodySchema,
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Zod schemas for order and item statuses.
 */
export const OrderStatusSchema = z.enum([
  OrderStatus.CREATED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.DELIVERED,
  OrderStatus.PAID,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.WASTED,
  OrderStatus.VOIDED,
  OrderStatus.EXPIRED,
]);

export const ItemStatusSchema = z.enum([
  ItemStatus.PENDING,
  ItemStatus.READY,
  ItemStatus.DELIVERED,
]);

/**
 * Zod schema for an order item boundary validation.
 */
export const OrderItemSchema = z.object({
  id: z.string().optional(),
  publicId: z.string().optional(),
  itemId: z.string().optional(),
  dishId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.union([z.number(), z.string()]),
  status: ItemStatusSchema,
  station: z.string().optional(),
  notes: z.string().nullable().optional(),
  modifiers: z.array(z.string()).optional(),
  version: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Zod schema for an order boundary validation.
 */
export const OrderSchema = z.object({
  id: z.string().optional(),
  publicId: z.string().optional(),
  orderId: z.string().optional(),
  tableNumber: z.number().int().positive().nullable().optional(),
  isTakeaway: z.boolean().optional(),
  status: OrderStatusSchema,
  version: z.number().int().nonnegative(),
  totalAmount: z.union([z.number(), z.string()]).optional(),
  items: z.array(OrderItemSchema),
  confirmedAt: z.string().nullable().optional(),
  confirmedBy: z.string().nullable().optional(),
  inPreparationAt: z.string().nullable().optional(),
  responsibleWaiterId: z.string().nullable().optional(),
  awaitingStockConfirmation: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

/**
 * Zod schema for KDS queue response.
 */
export const KdsQueueResponseSchema = z.array(OrderSchema);
export type KdsQueueResponse = z.infer<typeof KdsQueueResponseSchema>;
