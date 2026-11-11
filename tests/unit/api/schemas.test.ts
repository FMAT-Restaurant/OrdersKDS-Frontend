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

    it('successfully parses an order item with CANCELLED status', () => {
      const result = OrderItemSchema.safeParse({
        ...mockOrderItem1,
        status: ItemStatus.CANCELLED,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('CANCELLED');
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

    it('transforms null dishId and null station to undefined', () => {
      const itemWithNulls = {
        ...mockOrderItem1,
        dishId: null,
        station: null,
      };
      const result = OrderItemSchema.safeParse(itemWithNulls);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dishId).toBeUndefined();
        expect(result.data.station).toBeUndefined();
      }
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

    it('successfully parses an order in RESERVED status with diningSessionId and rejectionDetails', () => {
      const reservedOrder = {
        ...mockOrder1,
        status: OrderStatus.RESERVED,
        stockReservedAt: '2026-10-31T12:00:00Z',
        diningSessionId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        rejectionDetails: {
          missingIngredients: ['Carne'],
          rejectedItems: [{ offerId: 'dish-1', requestedQuantity: 2, availableQuantity: 0 }],
          reservedItems: [{ offerId: 'dish-2', quantity: 1 }],
        },
      };
      const result = OrderSchema.safeParse(reservedOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('RESERVED');
        expect(result.data.diningSessionId).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
        expect(result.data.rejectionDetails).toBeDefined();
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

    it('prioritizes orderId or publicId when order.id is numeric', () => {
      const orderWithNumericId = {
        ...mockOrder1,
        id: '12345',
        orderId: 'uuid-order-123',
        publicId: 'public-order-123',
        items: [
          {
            ...mockOrderItem1,
            id: '987',
            itemId: 'uuid-item-987',
          },
        ],
      };
      const result = KdsQueueResponseSchema.safeParse([orderWithNumericId]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].id).toBe('uuid-order-123');
        expect(result.data[0].items[0].id).toBe('uuid-item-987');
      }
    });

    it('falls back to publicId when orderId is omitted and id is numeric', () => {
      const orderWithPublicFallback = {
        ...mockOrder1,
        id: '999',
        orderId: undefined,
        publicId: 'pub-999',
        items: [
          {
            ...mockOrderItem1,
            id: '888',
            itemId: undefined,
            publicId: 'pub-item-888',
          },
        ],
      };
      const result = KdsQueueResponseSchema.safeParse([orderWithPublicFallback]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].id).toBe('pub-999');
        expect(result.data[0].items[0].id).toBe('pub-item-888');
      }
    });

    it('preserves numeric id if neither orderId nor publicId is present', () => {
      const orderNumericOnly = {
        ...mockOrder1,
        id: '555',
        orderId: undefined,
        publicId: undefined,
        items: [
          {
            ...mockOrderItem1,
            id: '444',
            itemId: undefined,
            publicId: undefined,
          },
        ],
      };
      const result = KdsQueueResponseSchema.safeParse([orderNumericOnly]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].id).toBe('555');
        expect(result.data[0].items[0].id).toBe('444');
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
