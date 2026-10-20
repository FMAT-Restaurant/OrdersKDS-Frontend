import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseSchema,
  KdsQueueResponseSchema,
  OrderItemSchema,
  OrderSchema,
} from '../../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../../src/shared/types/order.ts';
import { mockOrder1, mockOrderItem1 } from '../../mocks/fixtures/orderFixtures.ts';

describe('UT-FE-14: Zod Boundary Schemas', () => {
  describe('OrderItemSchema', () => {
    it('successfully parses a valid order item', () => {
      const result = OrderItemSchema.safeParse(mockOrderItem1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Hamburguesa Clásica');
        expect(result.data.status).toBe(ItemStatus.PENDING);
      }
    });

    it('rejects item with negative or zero quantity', () => {
      const invalidItem = { ...mockOrderItem1, quantity: 0 };
      const result = OrderItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });

    it('rejects item with invalid status', () => {
      const invalidItem = { ...mockOrderItem1, status: 'INVALID_STATUS' };
      const result = OrderItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });

    it('rejects item with empty name', () => {
      const invalidItem = { ...mockOrderItem1, name: '' };
      const result = OrderItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });
  });

  describe('OrderSchema', () => {
    it('successfully parses a valid order with items', () => {
      const result = OrderSchema.safeParse(mockOrder1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(OrderStatus.IN_PREPARATION);
        expect(result.data.version).toBe(3);
        expect(result.data.items).toHaveLength(2);
      }
    });

    it('rejects order with negative version', () => {
      const invalidOrder = { ...mockOrder1, version: -1 };
      const result = OrderSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('rejects order with invalid order status', () => {
      const invalidOrder = { ...mockOrder1, status: 'UNKNOWN' };
      const result = OrderSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });
  });

  describe('KdsQueueResponseSchema', () => {
    it('successfully parses an array of orders', () => {
      const result = KdsQueueResponseSchema.safeParse([mockOrder1]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });
  });

  describe('ApiErrorResponseSchema', () => {
    it('successfully parses canonical API error response', () => {
      const rawError = {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Token expired.',
          details: { reason: 'exp' },
        },
      };
      const result = ApiErrorResponseSchema.safeParse(rawError);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('rejects error response missing error envelope', () => {
      const rawError = { message: 'Something went wrong' };
      const result = ApiErrorResponseSchema.safeParse(rawError);
      expect(result.success).toBe(false);
    });
  });
});
