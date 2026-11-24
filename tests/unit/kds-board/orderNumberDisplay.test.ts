import { describe, expect, it } from 'vitest';
import {
  formatOrderTableLabel,
  getItemKey,
  getOrderKey,
  getOrderNumberDisplay,
} from '../../../src/features/kds-board/orderNumberDisplay.ts';
import type { Order, OrderItem } from '../../../src/shared/api/schemas.ts';

describe('orderNumberDisplay helpers', () => {
  describe('getOrderKey', () => {
    it('resolves id, orderId, publicId, and empty fallback in priority order', () => {
      expect(getOrderKey({ id: 'id-1', orderId: 'ord-2', publicId: 'pub-3' })).toBe('id-1');
      expect(getOrderKey({ orderId: 'ord-2', publicId: 'pub-3' })).toBe('ord-2');
      expect(getOrderKey({ publicId: 'pub-3' })).toBe('pub-3');
      expect(getOrderKey({})).toBe('');
    });
  });

  describe('getItemKey', () => {
    it('resolves id, itemId, publicId, indexed fallback, and empty fallback', () => {
      const withId: Pick<OrderItem, 'id'> & Partial<OrderItem> = {
        id: 'item-1',
        itemId: 'it-2',
        publicId: 'pub-3',
      };
      expect(getItemKey(withId)).toBe('item-1');
      expect(getItemKey({ itemId: 'it-2', publicId: 'pub-3' })).toBe('it-2');
      expect(getItemKey({ publicId: 'pub-3' })).toBe('pub-3');
      expect(getItemKey({}, 4)).toBe('item-4');
      expect(getItemKey({})).toBe('');
    });
  });

  describe('getOrderNumberDisplay', () => {
    it('formats numeric orderNumber, UUID short slice, and ord- prefixed IDs', () => {
      expect(getOrderNumberDisplay(66, 'ord-ignored')).toBe('66');
      expect(getOrderNumberDisplay(0, 'ord-ignored')).toBe('0');
      expect(getOrderNumberDisplay(null, 'a1b2c3d4-1111-2222-3333-44445555abcd')).toBe('ABCD');
      expect(getOrderNumberDisplay(undefined, 'ord-custom-42')).toBe('custom-42');
      expect(getOrderNumberDisplay(undefined, 'folio-99')).toBe('folio-99');
    });
  });

  describe('formatOrderTableLabel', () => {
    it('formats table number, takeaway label, or null when unassigned', () => {
      const dineIn: Pick<Order, 'tableNumber' | 'isTakeaway'> = { tableNumber: 7, isTakeaway: false };
      const takeaway: Pick<Order, 'tableNumber' | 'isTakeaway'> = { tableNumber: null, isTakeaway: true };
      const unassigned: Pick<Order, 'tableNumber' | 'isTakeaway'> = { tableNumber: undefined, isTakeaway: false };

      expect(formatOrderTableLabel(dineIn)).toBe('Mesa 7');
      expect(formatOrderTableLabel({ tableNumber: 0, isTakeaway: true })).toBe('Mesa 0');
      expect(formatOrderTableLabel(takeaway)).toBe('Para llevar');
      expect(formatOrderTableLabel(unassigned)).toBeNull();
    });
  });
});
